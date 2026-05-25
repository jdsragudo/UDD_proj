# John Dominic Ragudo
# BSCPE 2
# DSA Final Project: Binary Search Tree Sorting Algorithm

class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

class BST:   
    def __init__(self):
        self.root = None
    
    def insert(self,val):
        if not self.root:
            self.root = Node(val)
            return
        self._add_node(self.root, val)
    
    def _add_node(self, current, val):
        if val < current.val:
            if current.left is None:
                current.left = Node(val)
            else:
                self._add_node(current.left, val)
        else:
            if current.right is None:
                current.right = Node(val)
            else:
                self._addnode(current.right, val)
    
    def display(self):
        def _show(node, depth=0, label="Root"):
            if not node:
                return
            print(" " * depth + f"[{label}] {node.val}")
            _show(node.left, depth + 1, "L")
            _show(node.right, depth+1, "R")
        _show(self.root)

if __name__ == "__main__":
    print("Binary Search Tree")
    print("Enter numbers separated by spaces (10 5 15 3 7):")
    while True:
        user_input = input("\nNodes: ").strip()
        if not user_input:
            break
        try:
            nums = [int(x) for x in user_input.split()]
        except ValueError:
            print("Error: Please enter integers only.")
            continue
        tree = BST()
        for num in nums:
            tree.insert(num)
        print(f"\nInitial list: {nums}")
        print("\nBinary Search Tree:")
        tree.display()

        quit_prompt = input("\nPress Enter to try again, or 'q' to quit: ")
        if quit_prompt.lower().strip() == 'q':
            print("Done!")
            break