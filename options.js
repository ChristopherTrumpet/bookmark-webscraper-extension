const saveButton = document.getElementById("save");
const statusDiv = document.getElementById("status");

// Save the key
saveButton.addEventListener("click", () => {
  const apiKey = document.getElementById("apiKey").value;
  browser.storage.local.set({ apiKey }).then(() => {
    statusDiv.textContent = "API Key saved successfully!";
    setTimeout(() => statusDiv.textContent = "", 2000);
  });
});

// Restore the key when opening options
document.addEventListener("DOMContentLoaded", () => {
  browser.storage.local.get("apiKey").then((result) => {
    if (result.apiKey) {
      document.getElementById("apiKey").value = result.apiKey;
    }
  });
});