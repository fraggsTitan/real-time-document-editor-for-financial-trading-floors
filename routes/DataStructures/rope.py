# rope.py
# hey this is a rope data structure for text editing added under routes/ds
# think of it like a binary tree that glues strings together
# it's pretty good when ppl edit different parts of a big doc at the same time

from dataclasses import dataclass
from typing import Optional, Tuple

@dataclass
class Node:
    left: Optional['Node'] = None
    right: Optional['Node'] = None
    s: str = ""
    weight: int = 0
    height: int = 1

    def is_leaf(self):
        return self.left is None and self.right is None

    def length(self):
        if self.is_leaf():
            return len(self.s)
        return (self.left.length() if self.left else 0) + (self.right.length() if self.right else 0)

# helper stuff for balancing
def _h(n): return n.height if n else 0

def _update(n: Optional[Node]):
    if not n:
        return n
    n.weight = n.left.length() if n.left else (len(n.s) if n.is_leaf() else 0)
    n.height = 1 + max(_h(n.left), _h(n.right))
    return n

def _rot_right(y: Node) -> Node:
    x, T2 = y.left, y.left.right
    x.right = y
    y.left = T2
    _update(y); _update(x)
    return x

def _rot_left(x: Node) -> Node:
    y, T2 = x.right, x.right.left
    y.left = x
    x.right = T2
    _update(x); _update(y)
    return y

def _bf(n: Optional[Node]):
    return (_h(n.left) - _h(n.right)) if n else 0

def _rebalance(n: Optional[Node]):
    if not n:
        return n
    _update(n)
    bf = _bf(n)
    if bf > 1:
        if _bf(n.left) < 0:
            n.left = _rot_left(n.left)
        return _rot_right(n)
    if bf < -1:
        if _bf(n.right) > 0:
            n.right = _rot_right(n.right)
        return _rot_left(n)
    return n

def _concat(a: Optional[Node], b: Optional[Node]) -> Optional[Node]:
    if not a: return b
    if not b: return a
    return _rebalance(Node(left=a, right=b, s=""))

def _split(n: Optional[Node], idx: int) -> Tuple[Optional[Node], Optional[Node]]:
    if not n:
        return None, None
    if n.is_leaf():
        a, b = n.s[:idx], n.s[idx:]
        left = Node(s=a) if a else None
        right = Node(s=b) if b else None
        return left, right
    left_len = n.left.length() if n.left else 0
    if idx < left_len:
        l1, l2 = _split(n.left, idx)
        return l1, _rebalance(_concat(l2, n.right))
    else:
        r1, r2 = _split(n.right, idx - left_len)
        return _rebalance(_concat(n.left, r1)), r2

def _build_leaf(s: str, chunk=1024) -> Optional[Node]:
    if not s: return None
    if len(s) <= chunk: return Node(s=s)
    root = None
    for i in range(0, len(s), chunk):
        leaf = Node(s=s[i:i+chunk])
        root = _concat(root, leaf)
    return root

class Rope:
    def __init__(self, text: str = ""):
        self.root: Optional[Node] = _build_leaf(text)

    def length(self) -> int:
        return self.root.length() if self.root else 0

    def insert(self, pos: int, s: str):
        # drop some text in at pos
        if not s: return
        if pos < 0 or pos > self.length():
            raise IndexError("insert pos out of range")
        left, right = _split(self.root, pos)
        mid = _build_leaf(s)
        self.root = _rebalance(_concat(_concat(left, mid), right))

    def delete(self, pos: int, n: int):
        if n <= 0: return
        if pos < 0 or pos + n > self.length():
            raise IndexError("delete out of range")
        left, rest = _split(self.root, pos)
        _, right = _split(rest, n)
        self.root = _rebalance(_concat(left, right))

    def substring(self, a: int, b: int) -> str:
        # slice it up
        if a < 0: a = 0
        if b is None: b = self.length()
        if b < a: a, b = b, a
        if b > self.length(): b = self.length()
        _, rest = _split(self.root, a)
        mid, _ = _split(rest, b - a)
        return self._to_str(mid)

    def to_string(self) -> str:
        return self._to_str(self.root)

    @staticmethod
    def _to_str(n: Optional[Node]) -> str:
        if not n: return ""
        if n.is_leaf(): return n.s
        return Rope._to_str(n.left) + Rope._to_str(n.right)


# -------------------------
# test
# -------------------------
if __name__ == "__main__":
    # let's make a rope from some text
    text = "Hello, world!"
    r = Rope(text)
    print("Original text:", r.to_string())  # Hello, world!

    # insert something in the middle
    r.insert(7, "beautiful ")
    print("After insert:", r.to_string())  # Hello, beautiful world!

    # delete a few chars
    r.delete(13, 5)  # remove "iful "
    print("After delete:", r.to_string())  # Hello, beaut world!

    # grab a substring
    sub = r.substring(7, 12)
    print("Substring [7:12]:", sub)  # beaut

    # insert at the start
    r.insert(0, "Hey! ")
    print("After insert at beginning:", r.to_string())  # Hey! Hello, beaut world!

    # delete at the end
    r.delete(r.length() - 6, 6)
    print("After deleting at end:", r.to_string())  # should remove " world!"

    # final result
    print("Final string:", r.to_string())
