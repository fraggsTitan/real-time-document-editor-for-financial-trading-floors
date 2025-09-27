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

// ---------------------- ADTs ----------------------
class PieceTable {
  constructor(initial = "") {
    this.original = initial;
    this.addBuffer = "";
    this.pieces = initial.length
      ? [{ buffer: "original", start: 0, length: initial.length }]
      : [];
    this.cursor = initial.length;

    this.undoStack = [];
    this.redoStack = [];
    this._duringUndoRedo = false;
    this._lastInsertWasWhitespace = false;
  }

  moveCursor(pos) {
    this.cursor = Math.max(0, Math.min(pos, this.getLength()));
  }

  getLength() {
    return this.pieces.reduce((sum, p) => sum + p.length, 0);
  }

  // --- low-level insert without touching undoStack ---
  _insertPieceAt(pos, str, recordUndo = true) {
    const piece = { buffer: "add", start: this.addBuffer.length, length: str.length };
    this.addBuffer += str;

    let idx = 0, currPos = 0, newPieces = [];
    let inserted = false;
    
    for (let p of this.pieces) {
      if (currPos + p.length >= pos && !inserted) {
        const offset = pos - currPos;
        if (offset > 0) newPieces.push({ ...p, length: offset });
        newPieces.push(piece);
        if (offset < p.length) {
          newPieces.push({ 
            ...p, 
            start: p.start + offset, 
            length: p.length - offset 
          });
        }
        newPieces.push(...this.pieces.slice(idx + 1));
        inserted = true;
        break;
      }
      newPieces.push(p);
      currPos += p.length;
      idx++;
    }
    
    if (!inserted) newPieces.push(piece);
    this.pieces = newPieces;
    this.cursor = pos + str.length;

    if (recordUndo && !this._duringUndoRedo) {
      this.undoStack.push({ type: "insert", pos, str });
      this.redoStack = [];
    }
  }

  _deleteRange(pos, count, recordUndo = true) {
    if (count <= 0) return [];
    let newPieces = [], deleted = [], currPos = 0;

    for (let p of this.pieces) {
      if (currPos + p.length > pos && currPos < pos + count) {
        const startOffset = Math.max(0, pos - currPos);
        const endOffset = Math.min(p.length, pos + count - currPos);
        
        if (startOffset > 0) {
          newPieces.push({ ...p, length: startOffset });
        }
        
        deleted.push({ 
          ...p, 
          start: p.start + startOffset, 
          length: endOffset - startOffset 
        });
        
        if (endOffset < p.length) {
          newPieces.push({ 
            ...p, 
            start: p.start + endOffset, 
            length: p.length - endOffset 
          });
        }
      } else {
        newPieces.push(p);
      }
      currPos += p.length;
    }

    this.pieces = newPieces;
    this.cursor = pos;

    if (recordUndo && !this._duringUndoRedo) {
      this.undoStack.push({ type: "delete", pos, pieces: deleted });
      this.redoStack = [];
    }
    return deleted;
  }

  insertAtCursor(str) { 
    // Check if we should batch with the previous insert operation
    const shouldBatch = this.undoStack.length > 0 && 
                        this.undoStack[this.undoStack.length - 1].type === "insert" &&
                        !str.match(/\s/) && // current char is not whitespace
                        !this._lastInsertWasWhitespace; // previous char was not whitespace
    
    if (shouldBatch) {
      // Extend the last insert operation in undo stack
      const lastOp = this.undoStack[this.undoStack.length - 1];
      lastOp.str += str;
      // Insert the character but don't record a new undo operation
      this._insertPieceAt(this.cursor, str, false);
    } else {
      // Normal insertion with new undo record
      this._insertPieceAt(this.cursor, str, true);
    }
    
    this._lastInsertWasWhitespace = str.match(/\s/) !== null;
  }

  deleteAtCursor(count = 1) { 
    this._deleteRange(this.cursor - count, count); 
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return;

    this._duringUndoRedo = true;
    
    if (op.type === "insert") {
      this._deleteRange(op.pos, op.str.length, false);
      this.cursor = op.pos;
    } else if (op.type === "delete") {
      // Reconstruct the deleted text and insert it as one piece
      const deletedText = op.pieces.map(p => this._getTextFromPiece(p)).join("");
      this._insertPieceAt(op.pos, deletedText, false);
      this.cursor = op.pos + deletedText.length;
    }
    
    this._duringUndoRedo = false;
    this.redoStack.push(op);
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return;

    this._duringUndoRedo = true;
    
    if (op.type === "insert") {
      this._insertPieceAt(op.pos, op.str, false);
      this.cursor = op.pos + op.str.length;
    } else if (op.type === "delete") {
      const deletedLength = op.pieces.reduce((sum, p) => sum + p.length, 0);
      this._deleteRange(op.pos, deletedLength, false);
      this.cursor = op.pos;
    }
    
    this._duringUndoRedo = false;
    this.undoStack.push(op);
  }

  _getTextFromPiece(p) {
    return p.buffer === "original"
      ? this.original.slice(p.start, p.start + p.length)
      : this.addBuffer.slice(p.start, p.start + p.length);
  }

  getText() {
    return this.pieces.map(p => this._getTextFromPiece(p)).join("");
  }

  reset(initial = "") {
    this.original = initial;
    this.addBuffer = "";
    this.pieces = initial.length ? [{ buffer: "original", start: 0, length: initial.length }] : [];
    this.cursor = initial.length;
    this.undoStack = [];
    this.redoStack = [];
    this._lastInsertWasWhitespace = false;
  }
}

// ----------- Rope -----------
class RopeNode {
  constructor(value = "") {
    this.value = value;
    this.left = null;
    this.right = null;
    this.weight = this._calculateWeight();
  }

  _calculateWeight() {
    if (!this.left && !this.right) return this.value.length;
    return this.left ? this._getSubtreeLength(this.left) : 0;
  }

  _getSubtreeLength(node) {
    if (!node) return 0;
    if (!node.left && !node.right) return node.value.length;
    return this._getSubtreeLength(node.left) + this._getSubtreeLength(node.right);
  }
}

class Rope {
  constructor(str = "", leafSize = 512) {
    this.root = str.length > 0 ? new RopeNode(str) : null;
    this.cursor = str.length;
    this.LEAF_SIZE = leafSize;
  }

  getLength() {
    return this._getLength(this.root);
  }

  _getLength(node) {
    if (!node) return 0;
    if (!node.left && !node.right) return node.value.length;
    return this._getLength(node.left) + this._getLength(node.right);
  }

  moveCursor(pos) { 
    this.cursor = Math.max(0, Math.min(pos, this.getLength())); 
  }

  insertAtCursor(str) {
    if (!str) return;
    
    if (str.length <= this.LEAF_SIZE) {
      this._insertChunk(str);
    } else {
      let offset = 0;
      while (offset < str.length) {
        const chunk = str.slice(offset, offset + this.LEAF_SIZE);
        this._insertChunk(chunk);
        offset += this.LEAF_SIZE;
      }
    }
    this.cursor += str.length;
  }

  _insertChunk(str) {
    if (!this.root) {
      this.root = new RopeNode(str);
      return;
    }

    const [left, right] = this._split(this.root, this.cursor);
    const middle = new RopeNode(str);
    this.root = this._concat(this._concat(left, middle), right);
  }

  deleteAtCursor(count = 1) {
    if (count <= 0 || this.cursor < count) return;
    
    const [left, midRight] = this._split(this.root, this.cursor - count);
    const [, right] = this._split(midRight, count);
    this.root = this._concat(left, right);
    this.cursor -= count;
  }

  getText() {
    const result = [];
    this._inorder(this.root, result);
    return result.join("");
  }

  _inorder(node, res) {
    if (!node) return;
    if (!node.left && !node.right) {
      res.push(node.value);
    } else {
      this._inorder(node.left, res);
      this._inorder(node.right, res);
    }
  }

  _split(node, pos) {
    if (!node || pos <= 0) return [null, node];
    
    if (!node.left && !node.right) {
      // Leaf node
      if (pos >= node.value.length) return [node, null];
      const leftStr = node.value.slice(0, pos);
      const rightStr = node.value.slice(pos);
      return [
        leftStr ? new RopeNode(leftStr) : null,
        rightStr ? new RopeNode(rightStr) : null
      ];
    }

    // Internal node
    const leftLength = this._getLength(node.left);
    
    if (pos < leftLength) {
      const [leftLeft, leftRight] = this._split(node.left, pos);
      const rightSubtree = this._concat(leftRight, node.right);
      return [leftLeft, rightSubtree];
    } else if (pos === leftLength) {
      return [node.left, node.right];
    } else {
      const [rightLeft, rightRight] = this._split(node.right, pos - leftLength);
      const leftSubtree = this._concat(node.left, rightLeft);
      return [leftSubtree, rightRight];
    }
  }

  _concat(left, right) {
    if (!left) return right;
    if (!right) return left;
    
    const newRoot = new RopeNode();
    newRoot.left = left;
    newRoot.right = right;
    newRoot.weight = newRoot._calculateWeight();
    return newRoot;
  }
}

export { Rope, PieceTable };