from crypto.hash import sha256
import math

class merkletree:
    def __init__(self, leaves):
        """leaves = list of lines or chunks of your doc"""
        # first we hash each leaf so any tiny change is caught
        self.leaves = [self.hash_leaf(leaf) for leaf in leaves]
        # now we build the tree from bottom to top
        self.tree = self.build_tree(self.leaves)

    @staticmethod
    def hash_leaf(data):
        # hash a single leaf using sha256
        h = sha256.new(data.encode("utf-8"))
        return h.digest()

    @staticmethod
    def hash_pair(a, b):
        # combine 2 hashes and hash them again to get parent node
        h = sha256.new(a + b)
        return h.digest()

    def build_tree(self, leaves):
        # start building tree from the leaves
        tree = [leaves]  # first level = leaves
        current_level = leaves
        while len(current_level) > 1:
            next_level = []
            # go in pairs and hash them to get the next level
            for i in range(0, len(current_level), 2):
                left = current_level[i]
                # if odd number, just duplicate last one
                right = current_level[i+1] if i+1 < len(current_level) else left
                next_level.append(self.hash_pair(left, right))
            # add this level to the tree
            tree.append(next_level)
            current_level = next_level
        return tree

    def get_root(self):
        # top hash of the tree, aka merkle root
        # if this changes, something in the leaves changed
        return self.tree[-1][0].hex() if self.tree else None
