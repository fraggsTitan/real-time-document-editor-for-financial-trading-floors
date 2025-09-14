import { loadFileIntoEditor } from "./editor.js";

let currentFilePath = null;

// Export function for editor to use
export function renderFileContent(data) {
  const content = data.content || "";
  currentFilePath = data.path || null;
  
  // Call the editor function to load the file
  loadFileIntoEditor(data);
}

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
          const dsStatus = document.getElementById("dsStatus");
          if (dsStatus) {
            dsStatus.innerText = `Error loading file: ${err.message}`;
          }
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

// Initialize file tree on page load
document.addEventListener("DOMContentLoaded", loadDirectories);

// Export currentFilePath getter for potential future use
export function getCurrentFilePath() {
  return currentFilePath;
}