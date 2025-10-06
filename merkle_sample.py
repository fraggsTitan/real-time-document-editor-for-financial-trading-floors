import hashlib

# Function to compute SHA-256 hash
def hash_data(data):
    return hashlib.sha256(data.encode()).hexdigest()

# Sample edits on the trading floor document
edits = [
    "Trader A added: Buy 100 shares of ABC",
    "Trader B added: Sell 50 shares of XYZ",
    "Trader C added: Update risk report",
    "Trader D added: Add market analysis note"
]

# Step 1: Hash all individual edits (leaves of Merkle Tree)
leaf_hashes = [hash_data(edit) for edit in edits]
print("Leaf hashes:")
for h in leaf_hashes:
    print(h)
print("\n")

# Step 2: Compute parent hashes (combine pairs)
def compute_merkle_parent(hashes):
    parents = []
    # If odd number of hashes, duplicate last one
    if len(hashes) % 2 != 0:
        hashes.append(hashes[-1])
    for i in range(0, len(hashes), 2):
        combined = hashes[i] + hashes[i+1]
        parent_hash = hash_data(combined)
        parents.append(parent_hash)
    return parents

# Compute Merkle Root
current_level = leaf_hashes
while len(current_level) > 1:
    current_level = compute_merkle_parent(current_level)

merkle_root = current_level[0]
print("Merkle Root:", merkle_root)
