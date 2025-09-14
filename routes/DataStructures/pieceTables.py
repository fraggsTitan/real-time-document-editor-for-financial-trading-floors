"""
Piece Table implementation (simplified)

- original: read-only buffer (the initial content)
- add: append-only buffer for inserted text
- pieces: list of (buffer_id, start, length)
    buffer_id: 0 => original, 1 => add
    start: offset in that buffer
    length: length of substring

Operations:
- insert(pos, text)
- delete(pos, length)
- get_text()  -> reconstruct entire text (O(total length))
- substring(pos, length) -> extract substring
"""

from dataclasses import dataclass

@dataclass
class Piece:
    buf_id: int   # 0 = original, 1 = add
    start: int
    length: int

class PieceTable:
    original: str
    pieces: list# list of pieces
    def __init__(self, initial=""):
        self.original = initial# load in original text from file system
        self.add = ""# this contains all the added text as one single string
        # start with one piece referring to whole original (unless empty)
        self.pieces = []# this contains the positions of where each of the added/original text lie
        if initial:
            self.pieces.append(Piece(0, 0, len(initial)))

    def __len__(self):
        return sum(p.length for p in self.pieces)

    def _locate(self, pos):
        """Return (piece_index, offset_into_piece). pos is 0-based."""
        if pos < 0 or pos > len(self):
            raise IndexError("pos out of range")
        i = 0
        cur = 0
        """ 
            what this for loop does is, in case piece table has something like [hello,world,this,is,my,dsa project] and
            you gave pos as 25 then what it would do is go "dsa project" and return index as 5 and offset into that piece as 7 
        """
        for p in self.pieces:
            if cur + p.length > pos:
                return i, pos - cur
            cur += p.length
            i += 1
        # pos == len => return end position
        return len(self.pieces), 0

    def insert(self, pos, text):
        """Insert text at position pos (0-based)."""
        if not text:
            return
        if pos < 0 or pos > len(self):
            raise IndexError("pos out of range")
        add_start = len(self.add)# gets length of the add buffer to find out where this piece starts for the piece objectt
        self.add += text# adds the new text to the buffer
        new_piece = Piece(1, add_start, len(text))#creates a piece object

        pi, offset = self._locate(pos)# finds where exactly you wanted to add the piece
        if pi == len(self.pieces):  # append at end
            self.pieces.append(new_piece)
            return

        piece = self.pieces[pi]# piece index in between which your adding this element
        # if inserting in middle of a piece, split it
        new_pieces = []
        # thhe next 2 if statements break the original piece into 2 and add this new piece in the middle of it
        if offset > 0:
            new_pieces.append(Piece(piece.buf_id, piece.start, offset))
        new_pieces.append(new_piece)
        if offset < piece.length:
            new_pieces.append(Piece(piece.buf_id, piece.start + offset, piece.length - offset))

        # replace piece at index pi with new_pieces
        self.pieces[pi:pi+1] = new_pieces

    def delete(self, pos, length):
        """Delete length characters starting from pos."""
        if length <= 0:
            return
        if pos < 0 or pos + length > len(self):
            raise IndexError("delete range out of bounds")
        # Find start piece
        start_pi, start_off = self._locate(pos)
        end_pi, end_off = self._locate(pos + length)  # end_off is offset into piece at deletion end (pos+length)
        # Build new pieces replacing the affected range
        new = []
        # keep pieces before start_pi
        new.extend(self.pieces[:start_pi])
        # if there's left-over in the start piece before start_off, keep it
        if start_pi < len(self.pieces):
            p = self.pieces[start_pi]
            if start_off > 0:
                new.append(Piece(p.buf_id, p.start, start_off))
        # if there's leftover in the end piece after end_off, keep it
        if end_pi < len(self.pieces):
            p_end = self.pieces[end_pi]
            if end_off < p_end.length:
                # portion after end_off
                new.append(Piece(p_end.buf_id, p_end.start + end_off, p_end.length - end_off))
        # append remaining pieces after end_pi
        new.extend(self.pieces[end_pi+1:])
        self.pieces = new

    def get_text(self):
        """Reconstruct full text (O(n) in total text length)."""
        parts = []
        for p in self.pieces:
            buf = self.original if p.buf_id == 0 else self.add
            parts.append(buf[p.start:p.start + p.length])
        return "".join(parts)

    def substring(self, pos, length):
        """Get substring (pos, length) without building full string if possible."""
        if length <= 0:
            return ""
        if pos < 0 or pos + length > len(self):
            raise IndexError("range out of bounds")
        out = []
        cur = 0
        remaining = length
        for p in self.pieces:
            if cur + p.length <= pos:
                cur += p.length
                continue
            # some overlap
            start_in_piece = max(0, pos - cur)
            take = min(p.length - start_in_piece, remaining)
            buf = self.original if p.buf_id == 0 else self.add
            out.append(buf[p.start + start_in_piece : p.start + start_in_piece + take])
            remaining -= take
            if remaining == 0:
                break
            cur += p.length
        return "".join(out)

    def debug_pieces(self):
        return [ (p.buf_id, p.start, p.length) for p in self.pieces ]

# -------------------------
# Example usage / test
if __name__ == "__main__":
    pt = PieceTable("Hello world")
    print("Initial:", pt.get_text())
    pt.insert(5, ", dear")
    print("After insert:", pt.get_text())   # Hello, dear world
    pt.delete(5, 6)                         # delete ", dear"
    print("After delete:", pt.get_text())   # Hello world
    pt.insert(6, "beautiful ")
    print("Final:", pt.get_text())          # Hello beautiful world
    print("Pieces:", pt.debug_pieces())
