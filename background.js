browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "send-to-api",
    title: "Add to personal site",
    contexts: ["page", "selection"],
  });

  browser.contextMenus.create({
    id: "send-to-api-comment",
    title: "Add to personal site with comments",
    contexts: ["page", "selection"],
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (
    info.menuItemId === "send-to-api" ||
    info.menuItemId === "send-to-api-comment"
  ) {
    // Check for API Key first
    const data = await browser.storage.local.get("apiKey");
    if (!data.apiKey) {
      // Alert user to set key if missing
      browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () =>
          alert("Please set your API Key in the extension options first."),
      });
      browser.runtime.openOptionsPage();
      return;
    }

    const needsComment = info.menuItemId === "send-to-api-comment";

    // Inject Script to Scrape Data (and Prompt if needed)
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        args: [needsComment],
        func: scrapePageData,
      });

      const scrapedData = results[0].result;

      if (scrapedData) {
        await sendToApi(scrapedData, data.apiKey);

        browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => alert("Successfully sent to API!"),
        });
      }
    } catch (error) {
      console.error(error);
      browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => alert("Error: " + msg),
        args: [error.message],
      });
    }
  }
});

function scrapePageData(needsComment) {
  function getMediaType() {
    const url = window.location.hostname;

    const isAcademic = !!(
      document.querySelector('meta[name="citation_doi"]') ||
      document.querySelector('meta[name="citation_title"]') ||
      document.querySelector('meta[name="dc.identifier"]') ||
      document.querySelector(
        'script[type="application/x-research-gate-metadata"]',
      ) ||
      window.location.pathname.includes("arxiv") ||
      // Regex check for DOI pattern in text (10.xxxx/xxxx)
      document.body.innerText.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)
    );

    if (isAcademic) return "academic";

    // Check Domains first
    if (url.includes("youtube.com") || url.includes("vimeo.com"))
      return "video";
    if (url.includes("substack.com") || url.includes("medium.com"))
      return "blog";

    // Check Open Graph Types
    const ogType = document.querySelector('meta[property="og:type"]')?.content;
    if (ogType) {
      if (ogType.includes("video")) return "video";
      if (ogType.includes("article")) return "article";
    }

    // Check JSON-LD (Schema.org)
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    for (let script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.innerText);
        const type = data["@type"];
        if (type === "BlogPosting") return "blog";
        if (type === "NewsArticle" || type === "Article") return "article";
        if (type === "VideoObject") return "video";
      } catch (e) {}
    }

    return "article"; // Default fallback
  }

  const mediaType = getMediaType();

  // Prioritize specific meta tags because document.title often has clutter
  let titleCandidate =
    document.querySelector('meta[property="og:title"]') ||
    document.querySelector('meta[name="title"]') ||
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
    if (
      urlObj.hostname.includes("youtube.com") &&
      urlObj.pathname === "/watch"
    ) {
      url = `${urlObj.origin}/watch?v=${urlObj.searchParams.get("v")}`;
    }
  } catch (e) {}

  let author = "Unknown";

  if (mediaType === "academic") {
    const authorTags = document.querySelectorAll(
      'meta[name="citation_author"], meta[name="dc.creator"]',
    );
    switch (authorTags.length) {
      case 0:
        break;
      case 1:
        author = authorTags[0].content;
        break;
      case 2:
        author = authorTags[0].content + ", " + authorTags[1].content;
        break;
      default:
        author =
          authorTags[0].content + ", " + authorTags[1].content + ", et al.";
        break;
    }
  } else if (
    mediaType === "video" &&
    window.location.hostname.includes("youtube")
  ) {
    const ytAuthor =
      document.querySelector("#owner #channel-name a") ||
      document.querySelector(".ytd-channel-name a");
    if (ytAuthor) author = ytAuthor.innerText.trim();
  }

  if (author === "Unknown") {
    const authorMeta =
      document.querySelector('meta[name="author"]') ||
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
    url: String(window.location.href),
    comments: String(comment),
    type: mediaType,
  };
}

async function sendToApi(payload, apiKey) {
  const API_ENDPOINT = "https://api.cmkt.dev/bookmarks";

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  return await response.json();
}
