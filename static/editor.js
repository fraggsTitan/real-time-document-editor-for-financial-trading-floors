// ---------------------- Data Structures ----------------------

// ----------- Gap Buffer (fast cursor insertions) -----------
class GapBuffer {
  constructor(size = 1024) {
    this.buffer = new Array(size).fill(null);
    this.gapStart = 0;
    this.gapEnd = size;
    this.cursor = 0;
  }

  _resize() {
    const newBuffer = new Array(this.buffer.length * 2).fill(null);
    for (let i = 0; i < this.gapStart; i++) newBuffer[i] = this.buffer[i];
    const offset = newBuffer.length - (this.buffer.length - this.gapEnd);
    for (let i = this.gapEnd; i < this.buffer.length; i++)
      newBuffer[offset + (i - this.gapEnd)] = this.buffer[i];
    this.gapEnd = offset;
    this.buffer = newBuffer;
  }

  moveCursor(pos) {
    while (this.cursor < pos) this._moveRight();
    while (this.cursor > pos) this._moveLeft();
  }

  _moveRight() {
    if (this.gapEnd < this.buffer.length) {
      this.buffer[this.gapStart++] = this.buffer[this.gapEnd++];
      this.cursor++;
    }
  }

  _moveLeft() {
    if (this.gapStart > 0) {
      this.buffer[--this.gapEnd] = this.buffer[--this.gapStart];
      this.cursor--;
    }
  }

  insertAtCursor(ch) {
    if (this.gapStart === this.gapEnd) this._resize();
    this.buffer[this.gapStart++] = ch;
    this.cursor++;
  }

  deleteAtCursor() {
    if (this.cursor > 0) {
      this._moveLeft();
      this.buffer[this.gapStart] = null;
    }
  }

  getText() {
    return this.buffer.slice(0, this.gapStart).join("") + this.buffer.slice(this.gapEnd).join("");
  }
}

// ----------- Piece Table (undo/redo) -----------
class PieceTable {
  constructor(initial = "") {
    this.original = initial;
    this.addBuffer = "";
    this.pieces = initial.length > 0 ? [{ buffer: "original", start: 0, length: initial.length }] : [];
    this.undoStack = [];
    this.redoStack = [];
  }

  insertAtCursor(ch, pos) {
    this.undoStack.push(JSON.stringify(this.pieces));
    this.redoStack = [];
    this.addBuffer += ch;
    let newPiece = { buffer: "add", start: this.addBuffer.length - 1, length: 1 };

    let idx = 0, currentPos = 0;
    let newPieces = [];
    for (let piece of this.pieces) {
      if (currentPos + piece.length >= pos) {
        let offset = pos - currentPos;
        if (offset > 0) newPieces.push({ ...piece, length: offset });
        newPieces.push(newPiece);
        if (offset < piece.length) newPieces.push({ ...piece, start: piece.start + offset, length: piece.length - offset });
        newPieces.push(...this.pieces.slice(idx + 1));
        this.pieces = newPieces;
        return;
      }
      currentPos += piece.length;
      idx++;
    }
    this.pieces.push(newPiece);
  }

  deleteAtCursor(pos) {
    if (this.pieces.length === 0) return;
    this.undoStack.push(JSON.stringify(this.pieces));
    this.redoStack = [];

    let newPieces = [];
    let currentPos = 0;
    for (let piece of this.pieces) {
      if (currentPos + piece.length > pos && currentPos <= pos) {
        let offset = pos - currentPos;
        if (offset > 0) newPieces.push({ ...piece, length: offset });
        if (offset + 1 < piece.length) newPieces.push({ ...piece, start: piece.start + offset + 1, length: piece.length - offset - 1 });
      } else newPieces.push(piece);
      currentPos += piece.length;
    }
    this.pieces = newPieces;
  }

  undo() {
    if (this.undoStack.length > 0) {
      this.redoStack.push(JSON.stringify(this.pieces));
      this.pieces = JSON.parse(this.undoStack.pop());
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      this.undoStack.push(JSON.stringify(this.pieces));
      this.pieces = JSON.parse(this.redoStack.pop());
    }
  }

  getText() {
    let result = "";
    for (let p of this.pieces) {
      if (p.buffer === "original") result += this.original.slice(p.start, p.start + p.length);
      else result += this.addBuffer.slice(p.start, p.start + p.length);
    }
    return result;
  }
}

// ----------- Rope (middle insertions / concurrent edits) -----------
class RopeNode {
  constructor(value = "") {
    this.value = value;
    this.left = null;
    this.right = null;
    this.weight = value.length;
  }
}

class Rope {
  constructor(str = "") {
    this.root = new RopeNode(str);
  }

  _length(node) {
    if (!node) return 0;
    if (!node.left && !node.right) return node.value.length;
    return this._length(node.left) + this._length(node.right);
  }

  _split(node, pos) {
    if (!node) return [null, null];
    if (!node.left && !node.right) {
      const leftVal = node.value.slice(0, pos);
      const rightVal = node.value.slice(pos);
      return [new RopeNode(leftVal), new RopeNode(rightVal)];
    }
    if (pos < this._length(node.left)) {
      let [l, r] = this._split(node.left, pos);
      node.left = r;
      this._updateWeight(node);
      return [l, node];
    } else {
      let [l, r] = this._split(node.right, pos - this._length(node.left));
      node.right = l;
      this._updateWeight(node);
      return [node, r];
    }
  }

  _concat(left, right) {
    if (!left) return right;
    if (!right) return left;
    let newRoot = new RopeNode();
    newRoot.left = left;
    newRoot.right = right;
    this._updateWeight(newRoot);
    return newRoot;
  }

  _updateWeight(node) {
    if (!node) return;
    node.weight = this._length(node.left);
  }

  insertAtCursor(str, pos) {
    let [left, right] = this._split(this.root, pos);
    let middle = new RopeNode(str);
    this.root = this._concat(this._concat(left, middle), right);
  }

  deleteAtCursor(pos, count = 1) {
    let [left, middleRight] = this._split(this.root, pos);
    let [middle, right] = this._split(middleRight, count);
    this.root = this._concat(left, right);
  }

  _inorder(node, result) {
    if (!node) return;
    this._inorder(node.left, result);
    if (node.value) result.push(node.value);
    this._inorder(node.right, result);
  }

  getText() {
    const result = [];
    this._inorder(this.root, result);
    return result.join("");
  }
}

// ---------------------- Editor Controller ----------------------
let editor = document.getElementById("editor");
const cursorInfo = document.getElementById("cursorInfo");
const dsStatus = document.getElementById("dsStatus");

let gapBuffer = new GapBuffer();
let pieceTable = new PieceTable();
let rope = new Rope();

let prevText = "";

// Undo/Redo via Piece Table
document.getElementById("undoBtn").addEventListener("click", () => {
  pieceTable.undo();
  const text = pieceTable.getText();
  editor.value = text;
  prevText = text;
  dsStatus.innerText = "Current Operation: Undo via Piece Table";
});

document.getElementById("redoBtn").addEventListener("click", () => {
  pieceTable.redo();
  const text = pieceTable.getText();
  editor.value = text;
  prevText = text;
  dsStatus.innerText = "Current Operation: Redo via Piece Table";
});

// Save button
document.getElementById("saveBtn").addEventListener("click", () => {
  const text = editor.value;
  fetch("/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  }).then(res => res.json()).then(data => alert("Saved: " + data.status));
});

// Typing listener
editor.addEventListener("input", (e) => {
  const text = editor.value;
  const cursor = editor.selectionStart;

  let inserted = "";
  let deleted = 0;

  if (text.length > prevText.length) inserted = text.slice(prevText.length);
  else if (text.length < prevText.length) deleted = prevText.length - text.length;

  // Gap Buffer
  if (inserted.length > 0) {
    for (let i = 0; i < inserted.length; i++) {
      gapBuffer.moveCursor(cursor - inserted.length + i);
      gapBuffer.insertAtCursor(inserted[i]);
      dsStatus.innerText = "Current Operation: Inserting via Gap Buffer";
    }
  } else if (deleted > 0) {
    for (let i = 0; i < deleted; i++) {
      gapBuffer.moveCursor(cursor + i);
      gapBuffer.deleteAtCursor();
      dsStatus.innerText = "Current Operation: Deleting via Gap Buffer";
    }
  }

  // Piece Table
  if (inserted.length > 0) {
    for (let i = 0; i < inserted.length; i++)
      pieceTable.insertAtCursor(inserted[i], cursor - inserted.length + i);
  } else if (deleted > 0) {
    for (let i = 0; i < deleted; i++)
      pieceTable.deleteAtCursor(cursor + i);
  }

  // Rope
  if (inserted.length > 0) {
    for (let i = 0; i < inserted.length; i++) {
      rope.insertAtCursor(inserted[i], cursor - inserted.length + i);
      dsStatus.innerText += " | Rope updated";
    }
  } else if (deleted > 0) {
    for (let i = 0; i < deleted; i++) {
      rope.deleteAtCursor(cursor + i, 1);
      dsStatus.innerText += " | Rope updated";
    }
  }

  cursorInfo.innerText = `Cursor Position (Gap Buffer): ${gapBuffer.cursor}`;
  prevText = text;
});
