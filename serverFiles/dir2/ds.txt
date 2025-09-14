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
    this.pieces = initial.length > 0
      ? [{ buffer: "original", start: 0, length: initial.length }]
      : [];
    this.cursor = initial.length;

    this.undoStack = [];
    this.redoStack = [];
    this._duringUndoRedo = false; // NEW
  }

  moveCursor(pos) {
    if (pos < 0) pos = 0;
    if (pos > this.getLength()) pos = this.getLength();
    this.cursor = pos;
  }

  getLength() {
    return this.pieces.reduce((sum, p) => sum + p.length, 0);
  }

  insertAtCursor(str) {
    this.addBuffer += str;
    let piece = { buffer: "add", start: this.addBuffer.length - str.length, length: str.length };

    this._insertPiece(this.cursor, piece);

    // Only record undo if not called during undo/redo
    if (!this._duringUndoRedo) {
      this.undoStack.push({ type: "insert", pos: this.cursor, str });
      this.redoStack = [];
    }

    this.cursor += str.length;
  }

  _insertPiece(pos, piece) {
    let idx = 0, currentPos = 0;
    let newPieces = [];

    for (let p of this.pieces) {
      if (currentPos + p.length >= pos) {
        let offset = pos - currentPos;
        if (offset > 0) newPieces.push({ ...p, length: offset });
        newPieces.push(piece);
        if (offset < p.length)
          newPieces.push({ ...p, start: p.start + offset, length: p.length - offset });
        newPieces.push(...this.pieces.slice(idx + 1));
        this.pieces = newPieces;
        return;
      }
      currentPos += p.length;
      idx++;
    }
    this.pieces.push(piece); // at end
  }

  deleteAtCursor(count = 1) {
    if (this.cursor <= 0) return;

    let deleted = this._deleteRange(this.cursor - count, count);

    if (!this._duringUndoRedo) {
      this.undoStack.push({ type: "delete", pos: this.cursor - count, pieces: deleted });
      this.redoStack = [];
    }

    this.cursor -= count;
  }

  _deleteRange(pos, count) {
    let newPieces = [];
    let deleted = [];
    let currentPos = 0;

    for (let p of this.pieces) {
      if (currentPos + p.length > pos && currentPos < pos + count) {
        let startOffset = Math.max(0, pos - currentPos);
        let endOffset = Math.min(p.length, pos + count - currentPos);

        if (startOffset > 0)
          newPieces.push({ ...p, length: startOffset });
        deleted.push({ ...p, start: p.start + startOffset, length: endOffset - startOffset });
        if (endOffset < p.length)
          newPieces.push({ ...p, start: p.start + endOffset, length: p.length - endOffset });
      } else {
        newPieces.push(p);
      }
      currentPos += p.length;
    }

    this.pieces = newPieces;
    return deleted;
  }

  undo() {
    let op = this.undoStack.pop();
    if (!op) return;

    this._duringUndoRedo = true;

    if (op.type === "insert") {
      this._deleteRange(op.pos, op.str.length);
      this.cursor = op.pos;
    } else if (op.type === "delete") {
      for (let i = op.pieces.length - 1; i >= 0; i--) {
        this._insertPiece(op.pos, op.pieces[i]);
      }
      this.cursor = op.pos + op.pieces.reduce((sum, p) => sum + p.length, 0);
    }

    this._duringUndoRedo = false;
    this.redoStack.push(op);
  }

  redo() {
    let op = this.redoStack.pop();
    if (!op) return;

    this._duringUndoRedo = true;

    if (op.type === "insert") {
        this.moveCursor(op.pos);
        this.insertAtCursor(op.str);
    } else if (op.type === "delete") {
      this._deleteRange(op.pos, op.pieces.reduce((sum, p) => sum + p.length, 0));
      this.cursor = op.pos;
    }

    this._duringUndoRedo = false;
    this.undoStack.push(op);
  }

  getText() {
    let result = "";
    for (let p of this.pieces) {
      if (p.buffer === "original")
        result += this.original.slice(p.start, p.start + p.length);
      else
        result += this.addBuffer.slice(p.start, p.start + p.length);
    }
    return result;
  }
}



// ----------- Rope (middle insertions / concurrent edits) -----------
class RopeNode {
  constructor(value = "") {
    this.value = value;        // string for leaf
    this.left = null;
    this.right = null;
    this.weight = value.length; // weight = length of left subtree
  }
}

class Rope {
  constructor(str = "") {
    this.root = new RopeNode(str);
    this.cursor = str.length;
  }

  // ---- Utility ----
  _updateWeight(node) {
    if (!node) return 0;
    if (!node.left && !node.right) {
      node.weight = node.value.length;
      return node.weight;
    }
    node.weight = this._getLength(node.left);
    return node.weight + this._getLength(node.right);
  }

  _getLength(node) {
    if (!node) return 0;
    if (!node.left && !node.right) return node.value.length;
    return node.weight + this._getLength(node.right);
  }

  _split(node, pos) {
    if (!node) return [null, null];
    if (!node.left && !node.right) {
      // Leaf node
      const leftVal = node.value.slice(0, pos);
      const rightVal = node.value.slice(pos);
      return [
        leftVal ? new RopeNode(leftVal) : null,
        rightVal ? new RopeNode(rightVal) : null
      ];
    }

    if (pos < node.weight) {
      let [l, r] = this._split(node.left, pos);
      node.left = r;
      this._updateWeight(node);
      return [l, node];
    } else {
      let [l, r] = this._split(node.right, pos - node.weight);
      node.right = l;
      this._updateWeight(node);
      return [node, r];
    }
  }

  _concat(left, right) {
    if (!left) return right;
    if (!right) return left;
    const root = new RopeNode();
    root.left = left;
    root.right = right;
    this._updateWeight(root);
    return root;
  }

  // ---- Cursor Movement ----
  moveCursor(pos) {
    if (pos < 0) pos = 0;
    if (pos > this.getLength()) pos = this.getLength();
    this.cursor = pos;
  }

  getLength() {
    return this._getLength(this.root);
  }

  // ---- Insert / Delete ----
  insertAtCursor(str) {
    const [left, right] = this._split(this.root, this.cursor);
    const middle = new RopeNode(str);
    this.root = this._concat(this._concat(left, middle), right);
    this.cursor += str.length;
  }

  deleteAtCursor(count = 1) {
    if (count <= 0) return;
    const [left, midRight] = this._split(this.root, this.cursor);
    const [, right] = this._split(midRight, count);
    this.root = this._concat(left, right);
    // cursor stays the same
  }

  // ---- Convert to string ----
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

export{GapBuffer,Rope,PieceTable}
