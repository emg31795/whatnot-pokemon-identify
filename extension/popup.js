const input = document.getElementById("backendUrl");
const status = document.getElementById("status");

chrome.storage.sync.get("backendUrl", ({ backendUrl }) => {
  if (backendUrl) input.value = backendUrl;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({ backendUrl: input.value.trim() }, () => {
    status.textContent = "Saved.";
    setTimeout(() => (status.textContent = ""), 1500);
  });
});
