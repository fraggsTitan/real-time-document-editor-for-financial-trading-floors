import { PieceTable, Rope } from "./ds.js";

const editor = document.getElementById("editor");
const cursorInfo = document.getElementById("cursorInfo");
const dsStatus = document.getElementById("dsStatus");
const saveBtn = document.getElementById("saveBtn");

let rope = new Rope(editor.value);
let pieceTable = new PieceTable(editor.value);
let prevText = editor.value;
let inputLocked = false; // prevents input loop during undo/redo
let currentFilePath=null;

// When opening a file, set currentFilePath
function renderFileContent(data) {
  inputLocked = true; // Prevent input event from firing
  
  const content = data.content || "";
  
  // Reset both data structures
  rope = new Rope(content);
  pieceTable = new PieceTable(content);
  prevText = content;
  
  editor.value = content;
  editor.selectionStart = editor.selectionEnd = content.length;
  
  currentFilePath = data.path || null;
  cursorInfo.textContent = `Viewing: ${data.name} - Cursor: ${content.length}`;
  dsStatus.innerText = `Loaded file: ${data.name}`;
  
  inputLocked = false;
}

// Save button
saveBtn.addEventListener("click", async () => {
  const content = pieceTable.getText();
  const saveEndpoint ="/save";
  console.log(content);
  try {
    const res = await fetch(saveEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    alert("Saved: " + (data.status || "ok"));
  } catch (err) {
    console.error("Save failed:", err);
    alert("Save failed: " + err.message);
  }
});

// ---------------- Typing Listener ----------------
editor.addEventListener("input", () => {
  if (inputLocked) return; // CRITICAL: Skip processing when locked
  
  const currentCursor = editor.selectionStart;
  const currentText = editor.value;
  const oldLen = prevText.length;
  const newLen = currentText.length;

  if (newLen > oldLen) {
    // Insertion: figure out what was inserted and where
    const insertedLen = newLen - oldLen;
    const insertPos = currentCursor - insertedLen;
    const insertedText = currentText.slice(insertPos, currentCursor);
    
    // Move cursors to insertion point and insert
    rope.moveCursor(insertPos);
    pieceTable.moveCursor(insertPos);
    rope.insertAtCursor(insertedText);
    pieceTable.insertAtCursor(insertedText);
    
    dsStatus.innerText = `Inserted: "${insertedText}" at pos ${insertPos}`;
    
  } else if (newLen < oldLen) {
    // Deletion
    const deletedLen = oldLen - newLen;
    const deletePos = currentCursor;
    
    // Move cursors to after the deletion point and delete backwards
    rope.moveCursor(deletePos + deletedLen);
    pieceTable.moveCursor(deletePos + deletedLen);
    rope.deleteAtCursor(deletedLen);
    pieceTable.deleteAtCursor(deletedLen);
    
    dsStatus.innerText = `Deleted ${deletedLen} chars at pos ${deletePos}`;
  }

  // Update tracking
  prevText = currentText;
  cursorInfo.innerText = `Cursor Position: ${currentCursor}`;
});

// ---------------- Undo / Redo ----------------
document.getElementById("undoBtn").addEventListener("click", () => {
  inputLocked = true;
  console.log(pieceTable)
  console.log(rope)
  console.log("Before undo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("Before undo - text:", pieceTable.getText());
  
  pieceTable.undo();
  
  console.log("After undo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("After undo - text:", pieceTable.getText());
  
  const newText = pieceTable.getText();
  
  // Rebuild rope to match piece table
  rope = new Rope(newText);
  
  // Update textarea and cursor
  editor.value = newText;
  const cursorPos = Math.min(pieceTable.cursor, newText.length);
  editor.selectionStart = editor.selectionEnd = cursorPos;
  
  // Update tracking variables
  prevText = newText;
  
  dsStatus.innerText = `Undo performed - length: ${newText.length}`;
  cursorInfo.innerText = `Cursor Position: ${cursorPos}`;
  
  inputLocked = false;
});

document.getElementById("redoBtn").addEventListener("click", () => {
  inputLocked = true;
  
  console.log("Before redo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("Before redo - text:", pieceTable.getText());
  
  pieceTable.redo();
  
  console.log("After redo - pieces:", pieceTable.pieces.length, "cursor:", pieceTable.cursor);
  console.log("After redo - text:", pieceTable.getText());
  
  const newText = pieceTable.getText();
  
  // Rebuild rope to match piece table
  rope = new Rope(newText);
  
  // Update textarea and cursor
  editor.value = newText;
  const cursorPos = Math.min(pieceTable.cursor, newText.length);
  editor.selectionStart = editor.selectionEnd = cursorPos;
  
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
    if (data.status === "ok") renderFileExplorer(data);
  } catch (err) {
    console.error(err);
  }
}

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
    }

    ul.appendChild(li);
  });
  container.appendChild(ul);
}

function renderFileExplorer(data) {
  const container = document.getElementById("fileTree");
  container.innerHTML = "";
  const rootLabel = document.createElement("div");
  rootLabel.className = "label";
  rootLabel.innerHTML = `<span class="icon">📦</span> Root`;
  container.appendChild(rootLabel);
  renderTree(data.files, container);
}

document.addEventListener("DOMContentLoaded", loadDirectories);