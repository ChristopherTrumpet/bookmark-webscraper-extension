browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "send-to-api",
    title: "Add to personal site",
    contexts: ["page", "selection"]
  });

  browser.contextMenus.create({
    id: "send-to-api-comment",
    title: "Add to personal site with comments",
    contexts: ["page", "selection"]
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "send-to-api" || info.menuItemId === "send-to-api-comment") {
    
    // Check for API Key first
    const data = await browser.storage.local.get("apiKey");
    if (!data.apiKey) {
      // Alert user to set key if missing
      browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert("Please set your API Key in the extension options first.")
      });
      browser.runtime.openOptionsPage();
      return;
    }

    const needsComment = (info.menuItemId === "send-to-api-comment");

    // Inject Script to Scrape Data (and Prompt if needed)
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        args: [needsComment],
        func: scrapePageData
      });

      const scrapedData = results[0].result;
      
      if (scrapedData) {
        await sendToApi(scrapedData, data.apiKey);
        
        browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => alert("Successfully sent to API!")
        });
      }

    } catch (error) {
      console.error(error);
      browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => alert("Error: " + msg),
        args: [error.message]
      });
    }
  }
});

function scrapePageData(needsComment) {
  // Prioritize specific meta tags because document.title often has clutter
  let titleCandidate = document.querySelector('meta[name="title"]') || 
                       document.querySelector('meta[property="og:title"]') || 
                       document.querySelector('meta[name="twitter:title"]');

  // Extract the string content if a tag was found, otherwise use browser tab title
  let title = titleCandidate ? titleCandidate.content : document.title;

  // Fallback: If for some reason the meta tag was empty, go back to document.title
  if (!title) title = document.title;

  // Remove notification counts (e.g., "(3) Inbox")
  if (title && title.startsWith("(")) {
    title = title.replace(/^\(\d+\)\s+/, "");
  }

  let url = window.location.href;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube.com") && urlObj.pathname === "/watch") {
      url = `${urlObj.origin}/watch?v=${urlObj.searchParams.get("v")}`;
    }
  } catch (e) {}

  let author = "Unknown";
  
  if (window.location.hostname.includes("youtube.com")) {
    const ytAuthor = document.querySelector("#owner #channel-name a") || 
                     document.querySelector(".ytd-channel-name a");
    if (ytAuthor) author = ytAuthor.innerText.trim();
  } 
  
  if (author === "Unknown") {
    const authorMeta = document.querySelector('meta[name="author"]') || 
                       document.querySelector('meta[property="article:author"]') ||
                       document.querySelector('meta[property="og:site_name"]');
    if (authorMeta) author = authorMeta.content;
  }

  let comment = "";
  if (needsComment) {
    comment = prompt("Enter notes for this item:", "") || "";
  }

  return {
    title: String(title).trim(),
    author: String(author).trim(),
    url: String(url),
    comments: String(comment)
  };
}

async function sendToApi(payload, apiKey) {
  const API_ENDPOINT = "https://api.cmkt.dev/bookmarks";

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}` 
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  return await response.json();
}