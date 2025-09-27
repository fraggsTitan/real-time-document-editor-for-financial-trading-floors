import { PieceTable, Rope } from "./ds.js";
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const editor = document.getElementById("editor");
const cursorInfo = document.getElementById("cursorInfo");
const dsStatus = document.getElementById("dsStatus");
const saveBtn = document.getElementById("saveBtn");

// ---------------------- CODEMIRROR ----------------------
let codeMirror;

document.addEventListener("DOMContentLoaded", () => {
  codeMirror = CodeMirror.fromTextArea(editor, {
    lineNumbers: true,
    mode: "text/plain",
    theme: "default",
    lineWrapping: true,
  });
  codeMirror.setSize(null, "400px");

  setupCodeMirrorEvents();
  loadDirectories();
});

// ---------------------- DATA STRUCTURES ----------------------
let rope = new Rope("");
let pieceTable = new PieceTable("");
let prevText = "";
let inputLocked = false;
let currentFilePath = null;

const contextMenu = document.getElementById("contextMenu");
let selectedItemPath = null;
let selectedItemType = null;

// ---------------------- ENHANCED YJS COLLABORATIVE SYSTEM ----------------------
let ydoc = null;
let provider = null;
let ytext = null;
let undoManager = null;
let isRemoteChange = false;
let isUndoRedoOperation = false;
let collaborativeMode = false;
let currentDocumentRoom = null;
let isInitializing = false; // NEW: Prevent updates during initialization

// Document state management - stores state per document
let documentStates = new Map();

function createDocumentState(documentPath, content = "") {
  return {
    rope: new Rope(content),
    pieceTable: new PieceTable(content),
    prevText: content,
    ydoc: null,
    provider: null,
    ytext: null,
    undoManager: null,
    collaborativeMode: false,
    roomName: `doc-${btoa(documentPath).replace(/[^a-zA-Z0-9]/g, '')}`,
    isConnected: false
  };
}

function startCollaborativeSession(documentPath) {
  console.log(`Starting collaborative session for: ${documentPath}`);
  
  // Clean up existing session
  stopCollaborativeSession();
  
  // Get or create document state
  let docState = documentStates.get(documentPath);
  if (!docState) {
    const currentContent = pieceTable.getText();
    docState = createDocumentState(documentPath, currentContent);
    documentStates.set(documentPath, docState);
  }
  
  currentDocumentRoom = docState.roomName;
  isInitializing = true; // Prevent observer updates during setup
  
  // Initialize YJS for this document
  docState.ydoc = new Y.Doc();
  docState.provider = new WebsocketProvider('ws://localhost:1234', docState.roomName, docState.ydoc);
  docState.ytext = docState.ydoc.getText('content');
  
  // Create YJS UndoManager
  docState.undoManager = new Y.UndoManager(docState.ytext, {
    captureTimeout: 500
  });
  
  // Update global references
  ydoc = docState.ydoc;
  provider = docState.provider;
  ytext = docState.ytext;
  undoManager = docState.undoManager;
  
  // FIXED: Simplified YJS observer - remove overly restrictive conditions
  ytext.observe(event => {
    console.log('YJS observer triggered:', event.changes);
    
    // Only skip if we're in the middle of an undo/redo operation
    if (isUndoRedoOperation || isInitializing) {
      console.log('Skipping YJS update - operation in progress');
      return;
    }
    
    isRemoteChange = true;
    const newContent = ytext.toString();
    
    console.log('Remote content update:', newContent.length, 'chars');
    
    // FIXED: Always update if content is different, regardless of other conditions
    if (newContent !== pieceTable.getText()) {
      updateLocalDataStructures(newContent);
      updateCodeMirrorContent(newContent); // Use specific function for content updates
      
      dsStatus.innerText = `📡 Collaborative update - length: ${newContent.length}`;
      const cursorPos = codeMirror.indexFromPos(codeMirror.getCursor());
      cursorInfo.innerText = `Cursor Position: ${Math.min(cursorPos, newContent.length)}`;
    }
    
    isRemoteChange = false;
  });
  
  // Handle connection status
  provider.on('status', event => {
    console.log('Provider status:', event.status);
    
    if (event.status === 'connected') {
      docState.isConnected = true;
      
      // FIXED: Better initial content synchronization
      const currentContent = pieceTable.getText();
      const yTextContent = ytext.toString();
      
      if (currentContent && yTextContent === '') {
        // Local content exists, YJS is empty - populate YJS
        console.log('Initializing YJS with local content');
        ytext.insert(0, currentContent);
      } else if (yTextContent && yTextContent !== currentContent) {
        // YJS has different content - update local structures
        console.log('Updating local structures with YJS content');
        updateLocalDataStructures(yTextContent);
        updateCodeMirrorContent(yTextContent);
      }
      
      collaborativeMode = true;
      docState.collaborativeMode = true;
      isInitializing = false; // Enable observer after setup
      dsStatus.innerText = `✅ Collaborative mode: ${documentPath}`;
      
    } else if (event.status === 'disconnected') {
      docState.isConnected = false;
      dsStatus.innerText = `❌ Disconnected from collaboration`;
    }
  });
  
  provider.on('sync', isSynced => {
    console.log('Provider sync status:', isSynced);
    if (isSynced) {
      isInitializing = false;
      dsStatus.innerText = `🔄 Synced: ${documentPath}`;
    }
  });
  
  return provider;
}

function updateLocalDataStructures(newContent) {
  console.log('Updating local data structures with content length:', newContent.length);
  
  // Update piece table and rope with new content
  rope = new Rope(newContent);
  pieceTable = new PieceTable(newContent);
  prevText = newContent;
  
  // Update document state
  if (currentFilePath && documentStates.has(currentFilePath)) {
    const docState = documentStates.get(currentFilePath);
    docState.rope = rope;
    docState.pieceTable = pieceTable;
    docState.prevText = newContent;
  }
}

// FIXED: Separate function for CodeMirror content updates to prevent duplication
function updateCodeMirrorContent(newContent) {
  if (!codeMirror) return;
  
  const currentContent = codeMirror.getValue();
  if (currentContent === newContent) {
    console.log('CodeMirror content already matches - skipping update');
    return;
  }
  
  console.log('Updating CodeMirror content');
  const cursorPos = codeMirror.indexFromPos(codeMirror.getCursor());
  
  // FIXED: Use operation to ensure atomic updates and prevent event loops
  codeMirror.operation(() => {
    codeMirror.setValue(newContent);
    const newCursor = Math.min(cursorPos, newContent.length);
    codeMirror.setCursor(codeMirror.posFromIndex(newCursor));
  });
}

function stopCollaborativeSession() {
  console.log('Stopping collaborative session');
  
  // Save current state to document state map before cleanup
  if (currentFilePath && documentStates.has(currentFilePath)) {
    const docState = documentStates.get(currentFilePath);
    docState.rope = rope;
    docState.pieceTable = pieceTable;
    docState.prevText = prevText;
  }
  
  if (provider) {
    provider.destroy();
  }
  if (ydoc) {
    ydoc.destroy();
  }
  
  ydoc = null;
  provider = null;
  ytext = null;
  undoManager = null;
  collaborativeMode = false;
  currentDocumentRoom = null;
  isRemoteChange = false;
  isUndoRedoOperation = false;
  isInitializing = false;
}

// Hide menu on click elsewhere
document.addEventListener("click", () => {
  contextMenu.style.display = "none";
});

// ---------------------- ENHANCED EVENT HANDLERS ----------------------
function setupCodeMirrorEvents() {
  codeMirror.on("beforeChange", (cm, change) => {
    // FIXED: Allow changes during remote updates, just track them properly
    if (inputLocked || isUndoRedoOperation) return;

    const fromPos = cm.indexFromPos(change.from);
    const toPos = cm.indexFromPos(change.to);
    const insertedText = change.text.join("\n");

    console.log('CodeMirror beforeChange:', {fromPos, toPos, insertedText, origin: change.origin, isRemoteChange});

    if (change.origin === "+input" || change.origin === "paste" || change.origin === "+delete" || change.origin === "cut") {
      
      // FIXED: Only update YJS for local changes (not remote changes)
      if (collaborativeMode && ytext && !isRemoteChange) {
        console.log('Updating YJS from local change');
        
        // Use transaction to ensure atomicity
        ydoc.transact(() => {
          if (fromPos !== toPos) {
            const deletedLen = toPos - fromPos;
            ytext.delete(fromPos, deletedLen);
          }

          if (insertedText && change.origin !== "+delete" && change.origin !== "cut") {
            ytext.insert(fromPos, insertedText);
          }
        });
      } else if (!collaborativeMode) {
        // Local-only mode: update piece table directly
        if (fromPos !== toPos) {
          const deletedLen = toPos - fromPos;
          rope.moveCursor(toPos);
          pieceTable.moveCursor(toPos);
          rope.deleteAtCursor(deletedLen);
          pieceTable.deleteAtCursor(deletedLen);
          dsStatus.innerText = `Deleted ${deletedLen} chars at pos ${fromPos}`;
        }

        if (insertedText && change.origin !== "+delete" && change.origin !== "cut") {
          rope.moveCursor(fromPos);
          pieceTable.moveCursor(fromPos);
          rope.insertAtCursor(insertedText);
          pieceTable.insertAtCursor(insertedText);
          dsStatus.innerText = `Inserted: "${insertedText}" at pos ${fromPos}`;
        }

        prevText = pieceTable.getText();
      }
    }
  });

  codeMirror.on("cursorActivity", () => {
    if (inputLocked || isUndoRedoOperation) return;
    const cursor = codeMirror.getCursor();
    const pos = codeMirror.indexFromPos(cursor);
    cursorInfo.innerText = `Cursor Position: ${pos}`;
  });
}

// ---------------------- FIXED FILE RENDERING ----------------------
function renderFileContent(data) {
  if (!codeMirror) {
    setTimeout(() => renderFileContent(data), 100);
    return;
  }

  console.log('Rendering file content:', data.path);
  
  inputLocked = true;
  const content = data.content || "";
  const filePath = data.path;

  // FIXED: Check if we're already viewing this document
  if (currentFilePath === filePath) {
    console.log('Already viewing this document - skipping reload');
    inputLocked = false;
    return;
  }

  // Stop any existing collaborative session
  stopCollaborativeSession();

  // FIXED: Better state management when switching documents
  let docState = documentStates.get(filePath);
  if (docState) {
    console.log('Restoring saved document state');
    // Restore saved state
    rope = docState.rope;
    pieceTable = docState.pieceTable;
    prevText = docState.prevText;
  } else {
    console.log('Creating new document state');
    // Fresh document - create new data structures
    rope = new Rope(content);
    pieceTable = new PieceTable(content);
    prevText = content;
  }
  
  // FIXED: Only update UI if content is actually different
  const contentToShow = docState ? pieceTable.getText() : content;
  const currentDisplayed = codeMirror.getValue();
  
  // Update UI
  document.getElementById("fileName").innerHTML = `${filePath}`;
  
  // FIXED: Only setValue if content is actually different to prevent duplication
  if (currentDisplayed !== contentToShow) {
    console.log('Updating CodeMirror with new content');
    codeMirror.operation(() => {
      codeMirror.setValue(contentToShow);
      codeMirror.setCursor(codeMirror.posFromIndex(contentToShow.length));
    });
  } else {
    console.log('Content unchanged - keeping current CodeMirror state');
  }

  currentFilePath = filePath;
  cursorInfo.textContent = `Viewing: ${data.name} - Cursor: ${contentToShow.length}`;
  dsStatus.innerText = `📁 Loaded file: ${data.name} - Starting collaboration...`;

  // Always start collaborative session for any document
  if (filePath) {
    startCollaborativeSession(filePath);
  }

  inputLocked = false;
}

// ---------------------- SAVE BUTTON ----------------------
saveBtn.addEventListener("click", async () => {
  const content = collaborativeMode && ytext ? ytext.toString() : pieceTable.getText();
  let saveEndpoint, requestBody;

  if (currentFilePath) {
    saveEndpoint = "/save-to-file";
    requestBody = { content, path: currentFilePath };
  } else {
    saveEndpoint = "/save";
    requestBody = { content };
  }

  try {
    const res = await fetch(saveEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status === "ok") {
      const fileName = currentFilePath ? currentFilePath : "saved_doc.txt";
      alert(`Saved successfully to: ${fileName}`);
      dsStatus.innerText = `💾 Saved to: ${fileName}`;
    } else alert("Save failed: " + data.message);
  } catch (err) {
    console.error(err);
    alert("Save failed: " + err.message);
  }
});

// ---------------------- FIXED UNDO/REDO SYSTEM ----------------------
function performUndo() {
  console.log('Performing undo - collaborative mode:', collaborativeMode);
  
  if (collaborativeMode && undoManager && undoManager.canUndo()) {
    isUndoRedoOperation = true;
    inputLocked = true;
    
    try {
      undoManager.undo();
      const newContent = ytext.toString();
      
      updateLocalDataStructures(newContent);
      updateCodeMirrorContent(newContent);
      
      dsStatus.innerText = `↶ Collaborative undo - length: ${newContent.length}`;
      cursorInfo.innerText = `Cursor Position: ${Math.min(pieceTable.cursor || 0, newContent.length)}`;
    } catch (error) {
      console.error('Collaborative undo failed:', error);
      dsStatus.innerText = "❌ Undo failed";
    } finally {
      isUndoRedoOperation = false;
      inputLocked = false;
    }
  } else if (!collaborativeMode && pieceTable.undoStack && pieceTable.undoStack.length) {
    inputLocked = true;
    
    const oldText = pieceTable.getText();
    pieceTable.undo();
    const newText = pieceTable.getText();
    
    rope = new Rope(newText);
    
    codeMirror.operation(() => {
      codeMirror.setValue(newText);
      const cursorPos = Math.min(pieceTable.cursor || 0, newText.length);
      codeMirror.setCursor(codeMirror.posFromIndex(cursorPos));
    });
    
    prevText = newText;
    dsStatus.innerText = `↶ Local undo - length: ${newText.length}`;
    cursorInfo.innerText = `Cursor Position: ${pieceTable.cursor || 0}`;
    
    inputLocked = false;
  } else {
    dsStatus.innerText = "❌ No undo operations available";
  }
}

function performRedo() {
  console.log('Performing redo - collaborative mode:', collaborativeMode);
  
  if (collaborativeMode && undoManager && undoManager.canRedo()) {
    isUndoRedoOperation = true;
    inputLocked = true;
    
    try {
      undoManager.redo();
      const newContent = ytext.toString();
      
      updateLocalDataStructures(newContent);
      updateCodeMirrorContent(newContent);
      
      dsStatus.innerText = `↷ Collaborative redo - length: ${newContent.length}`;
      cursorInfo.innerText = `Cursor Position: ${Math.min(pieceTable.cursor || 0, newContent.length)}`;
    } catch (error) {
      console.error('Collaborative redo failed:', error);
      dsStatus.innerText = "❌ Redo failed";
    } finally {
      isUndoRedoOperation = false;
      inputLocked = false;
    }
  } else if (!collaborativeMode && pieceTable.redoStack && pieceTable.redoStack.length) {
    inputLocked = true;
    
    const oldText = pieceTable.getText();
    pieceTable.redo();
    const newText = pieceTable.getText();
    
    rope = new Rope(newText);
    
    codeMirror.operation(() => {
      codeMirror.setValue(newText);
      const cursorPos = Math.min(pieceTable.cursor || 0, newText.length);
      codeMirror.setCursor(codeMirror.posFromIndex(cursorPos));
    });
    
    prevText = newText;
    dsStatus.innerText = `↷ Local redo - length: ${newText.length}`;
    cursorInfo.innerText = `Cursor Position: ${pieceTable.cursor || 0}`;
    
    inputLocked = false;
  } else {
    dsStatus.innerText = "❌ No redo operations available";
  }
}

document.getElementById("undoBtn").addEventListener("click", performUndo);
document.getElementById("redoBtn").addEventListener("click", performRedo);

// [Keep all the existing file explorer code exactly as it was - no changes needed]
// ---------------- File Explorer ----------------
async function loadDirectories() {
  try {
    const res = await fetch("/directories");
    const data = await res.json();
    console.log(data);
    if (data.status === "ok") renderFileExplorer(data);
  } catch (err) {
    console.error(err);
  }
}

let currentDirPath = "";

const createModal = document.getElementById("createModal");
const createConfirm = document.getElementById("createConfirm");
const createCancel = document.getElementById("createCancel");

createCancel.addEventListener("click", () => {
  createModal.style.display = "none";
});

createConfirm.addEventListener("click", () => {
  const nameInput = document.getElementById("newName").value.trim();
  if (!nameInput) return alert("Name cannot be empty!");

  const type = document.querySelector('input[name="newType"]:checked').value;

  let name = nameInput;
  if (type === "file" && !name.includes(".")) name += ".txt";

  const newPath = currentDirPath ? currentDirPath + "/" + name : name;
  const endpoint = type === "folder" ? "/create-directory" : "/create-file";

  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: newPath })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "ok") {
      createModal.style.display = "none";
      loadDirectories();
    } else {
      alert(`Error: ${data.message}`);
    }
  })
  .catch(err => {
    console.error(err);
    alert("Failed to create file/folder");
  });
});

function renderTree(nodes, container) {
  const ul = document.createElement("ul");
  nodes.forEach(item => {
    const li = document.createElement("li");
    li.className = item.type;

    const label = document.createElement("span");
    label.className = "label";

    const icon = document.createElement("span");
    icon.className = "icon";

    if (item.type === "dir") {
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "▶";
      icon.textContent = "📁";
      label.appendChild(arrow);
      label.appendChild(icon);
      label.appendChild(document.createTextNode(item.name));
      li.appendChild(label);

      let nested;
      if (item.children && item.children.length > 0) {
        nested = document.createElement("ul");
        nested.classList.add("nested");
        nested.style.maxHeight = "0";
        nested.style.overflow = "hidden";
        nested.style.transition = "max-height 0.3s ease";
        renderTree(item.children, nested);
        li.appendChild(nested);
      }

      label.addEventListener("click", () => {
        if (!nested) return;
        const isOpen = nested.classList.contains("open");
        if (isOpen) {
          nested.style.maxHeight = nested.scrollHeight + "px";
          requestAnimationFrame(() => nested.style.maxHeight = "0");
          nested.classList.remove("open");
          arrow.textContent = "▶";
          icon.textContent = "📁";
        } else {
          nested.classList.add("open");
          nested.style.maxHeight = nested.scrollHeight + "px";
          arrow.textContent = "▼";
          icon.textContent = "📂";
          nested.addEventListener("transitionend", () => {
            if (nested.classList.contains("open")) nested.style.maxHeight = "none";
          }, { once: true });
        }
      });

      label.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedItemPath = item.path;
        selectedItemType = item.type;
        contextMenu.style.top = e.pageY + "px";
        contextMenu.style.left = e.pageX + "px";
        contextMenu.style.display = "block";
      });

      const createBtn = document.createElement("button");
      createBtn.textContent = "+";
      createBtn.style.marginLeft = "5px";
      createBtn.title = "Create file/folder";
      label.appendChild(createBtn);

      createBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        currentDirPath = item.path;
        document.getElementById("newName").value = "";
        createModal.style.display = "flex";
      });
    } else {
      // file
      icon.textContent = "📄";
      label.appendChild(document.createTextNode("   "));
      label.appendChild(icon);
      label.appendChild(document.createTextNode(item.name));
      li.appendChild(label);

      label.addEventListener("click", async e => {
        e.stopPropagation();
        try {
          const res = await fetch(`/file-info?path=${encodeURIComponent(item.path)}`);
          const data = await res.json();
          if (data.status === "ok") {
            data.path = item.path;
            renderFileContent(data);
          }
        } catch (err) {
          console.error(err);
          dsStatus.innerText = `Error loading file: ${err.message}`;
        }
      });
      
      label.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedItemPath = item.path;
        selectedItemType = item.type;
        contextMenu.style.top = e.pageY + "px";
        contextMenu.style.left = e.pageX + "px";
        contextMenu.style.display = "block";
      });
    }

    ul.appendChild(li);
  });
  container.appendChild(ul);
}

document.getElementById("ctxDelete").addEventListener("click", () => {
  if (!selectedItemPath) return;
  if (!confirm(`Are you sure you want to delete ${selectedItemPath}?`)) return;

  fetch("/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: selectedItemPath })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "ok") loadDirectories();
    else alert(`Error: ${data.message}`);
  })
  .catch(err => console.error(err));

  contextMenu.style.display = "none";
});

document.getElementById("ctxMove").addEventListener("click", () => {
  if (!selectedItemPath) return;
  const newDir = prompt("Enter new directory path (relative to root):");
  if (!newDir) return;

  fetch("/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: selectedItemPath, newDir })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "ok") loadDirectories();
    else alert(`Error: ${data.message}`);
  })
  .catch(err => console.error(err));

  contextMenu.style.display = "none";
});

function renderFileExplorer(data) {
  const container = document.getElementById("fileTree");
  container.innerHTML = "";

  const rootLabel = document.createElement("div");
  rootLabel.className = "label";
  rootLabel.innerHTML = `<span class="icon">📦</span> Root`;
  container.appendChild(rootLabel);

  const createBtn = document.createElement("button");
  createBtn.textContent = "+";
  createBtn.style.marginLeft = "5px";
  createBtn.title = "Create file/folder in root";
  rootLabel.appendChild(createBtn);

  createBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    currentDirPath = "";
    document.getElementById("newName").value = "";
    createModal.style.display = "flex";
  });

  renderTree(data.files, container);
}

document.getElementById("createCancel").addEventListener("click", () => {
  createModal.style.display = "none";
});
