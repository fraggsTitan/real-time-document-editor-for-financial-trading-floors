import { PieceTable, Rope } from "./ds.js";

const editor = document.getElementById("editor");
const cursorInfo = document.getElementById("cursorInfo");
const dsStatus = document.getElementById("dsStatus");
const saveBtn = document.getElementById("saveBtn");

// Initialize CodeMirror
let codeMirror;

// Initialize CodeMirror when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Initialize CodeMirror with minimal config
  codeMirror = CodeMirror.fromTextArea(editor, {
    lineNumbers: true,
    mode: "text/plain",
    theme: "default",
    lineWrapping: true
  });
  
  // Set size for better visibility
  codeMirror.setSize(null, "400px");
  
  // Setup CodeMirror event handlers
  setupCodeMirrorEvents();
  
  // Load directories
  loadDirectories();
});

let rope = new Rope(editor.value || "");
let pieceTable = new PieceTable(editor.value || "");
let prevText = editor.value || "";
let inputLocked = false; // prevents input loop during undo/redo
let currentFilePath = null;
const contextMenu = document.getElementById("contextMenu");
let selectedItemPath = null;
let selectedItemType = null;

// Hide menu on click elsewhere
document.addEventListener("click", () => {
  contextMenu.style.display = "none";
});

function setupCodeMirrorEvents() {
  // Handle text changes - hook into CodeMirror change events
  codeMirror.on("beforeChange", (cm, change) => {
    if (inputLocked) return; // CRITICAL: Skip processing when locked
    
    // Convert CodeMirror positions to absolute indices
    const fromPos = cm.indexFromPos(change.from);
    const toPos = cm.indexFromPos(change.to);
    const currentText = cm.getValue();
    
    // Get the text that will be inserted
    const insertedText = change.text.join("\n");
    
    if (change.origin === "+input" || change.origin === "paste" || change.origin === "+delete" || change.origin === "cut") {
      // Handle deletion first if there's a selection being replaced
      if (fromPos !== toPos) {
        const deletedLen = toPos - fromPos;
        
        // Move cursors to after the deletion point and delete backwards
        rope.moveCursor(toPos);
        pieceTable.moveCursor(toPos);
        rope.deleteAtCursor(deletedLen);
        pieceTable.deleteAtCursor(deletedLen);
        
        dsStatus.innerText = `Deleted ${deletedLen} chars at pos ${fromPos}`;
      }
      
      // Handle insertion if there's text to insert
      if (insertedText && change.origin !== "+delete" && change.origin !== "cut") {
        // Move cursors to insertion point and insert
        rope.moveCursor(fromPos);
        pieceTable.moveCursor(fromPos);
        rope.insertAtCursor(insertedText);
        pieceTable.insertAtCursor(insertedText);
        
        dsStatus.innerText = `Inserted: "${insertedText}" at pos ${fromPos}`;
      }
    }
  });
  
  // Handle cursor position changes
  codeMirror.on("cursorActivity", () => {
    if (inputLocked) return;
    const cursor = codeMirror.getCursor();
    const pos = codeMirror.indexFromPos(cursor);
    cursorInfo.innerText = `Cursor Position: ${pos}`;
  });
}

// When opening a file, set currentFilePath
function renderFileContent(data) {
  if (!codeMirror) {
    setTimeout(() => renderFileContent(data), 100);
    return;
  }
  
  inputLocked = true; // Prevent input event from firing
  
  const content = data.content || "";
  
  // Reset both data structures
  rope = new Rope(content);
  pieceTable = new PieceTable(content);
  prevText = content;
  document.getElementById("fileName").innerHTML = `${data.path}`;
  
  // Update CodeMirror content
  codeMirror.setValue(content);
  
  // Set cursor to end
  const endPos = codeMirror.posFromIndex(content.length);
  codeMirror.setCursor(endPos);
  
  currentFilePath = data.path || null;
  console.log(currentFilePath);
  cursorInfo.textContent = `Viewing: ${data.name} - Cursor: ${content.length}`;
  dsStatus.innerText = `Loaded file: ${data.name}`;
  
  inputLocked = false;
}

// Save button
saveBtn.addEventListener("click", async () => {
  const content = pieceTable.getText();
  
  // Choose endpoint and payload based on whether we have a current file
  let saveEndpoint, requestBody;
  
  if (currentFilePath) {
    // Save to the specific file that's currently open
    saveEndpoint = "/save-to-file";
    requestBody = { 
      content: content, 
      path: currentFilePath 
    };
    console.log(`Saving to file: ${currentFilePath}`);
  } else {
    // Save to default saved_doc.txt
    saveEndpoint = "/save";
    requestBody = { content: content };
    console.log("Saving to default file (saved_doc.txt)");
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
      dsStatus.innerText = `Saved to: ${fileName}`;
    } else {
      alert("Save failed: " + data.message);
    }
  } catch (err) {
    console.error("Save failed:", err);
    alert("Save failed: " + err.message);
  }
});

// ---------------- Undo / Redo ----------------
document.getElementById("undoBtn").addEventListener("click", () => {
  if (!codeMirror) return;
  
  inputLocked = true;
  console.log(pieceTable);
  console.log(rope);
  console.log("Before undo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("Before undo - text:", pieceTable.getText());
  
  pieceTable.undo();
  
  console.log("After undo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("After undo - text:", pieceTable.getText());
  
  const newText = pieceTable.getText();
  
  // Rebuild rope to match piece table
  rope = new Rope(newText);
  
  // Update CodeMirror content and cursor
  codeMirror.setValue(newText);
  const cursorPos = Math.min(pieceTable.cursor, newText.length);
  const cursorPosObj = codeMirror.posFromIndex(cursorPos);
  codeMirror.setCursor(cursorPosObj);
  
  // Update tracking variables
  prevText = newText;
  
  dsStatus.innerText = `Undo performed - length: ${newText.length}`;
  cursorInfo.innerText = `Cursor Position: ${cursorPos}`;
  
  inputLocked = false;
});

document.getElementById("redoBtn").addEventListener("click", () => {
  if (!codeMirror) return;
  
  inputLocked = true;
  
  console.log("Before redo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("Before redo - text:", pieceTable.getText());
  
  pieceTable.redo();
  
  console.log("After redo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("After redo - text:", pieceTable.getText());
  
  const newText = pieceTable.getText();
  
  // Rebuild rope to match piece table
  rope = new Rope(newText);
  
  // Update CodeMirror content and cursor
  codeMirror.setValue(newText);
  const cursorPos = Math.min(pieceTable.cursor, newText.length);
  const cursorPosObj = codeMirror.posFromIndex(cursorPos);
  codeMirror.setCursor(cursorPosObj);
  
  // Update tracking variables
  prevText = newText;
  
  dsStatus.innerText = `Redo performed - length: ${newText.length}`;
  cursorInfo.innerText = `Cursor Position: ${cursorPos}`;
  
  inputLocked = false;
});

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

  // Normalize path: avoid double slashes
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
      loadDirectories(); // refresh file tree
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
      // Add right-click menu for folders
      label.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();

        selectedItemPath = item.path;
        selectedItemType = item.type;

        contextMenu.style.top = e.pageY + "px";
        contextMenu.style.left = e.pageX + "px";
        contextMenu.style.display = "block";
      });

      //
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
      //
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
            // Pass the file path for future saving
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

  // --- Root label ---
  const rootLabel = document.createElement("div");
  rootLabel.className = "label";
  rootLabel.innerHTML = `<span class="icon">📦</span> Root`;
  container.appendChild(rootLabel);

  // Add create button for root
  const createBtn = document.createElement("button");
  createBtn.textContent = "+";
  createBtn.style.marginLeft = "5px";
  createBtn.title = "Create file/folder in root";
  rootLabel.appendChild(createBtn);

  createBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    currentDirPath = ""; // treat root as empty string
    document.getElementById("newName").value = "";
    createModal.style.display = "flex";
  });

  // Render rest of the tree
  renderTree(data.files, container);
}

// Modal buttons
document.getElementById("createCancel").addEventListener("click", () => {
  createModal.style.display = "none";
});