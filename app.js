
import { pipeline, env } from
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

env.allowLocalModels = false;
env.useBrowserCache = true;

const $ = id => document.getElementById(id);

const form = $("listingForm");
const productName = $("productName");
const features = $("features");
const category = $("category");
const platform = $("platform");
const generateBtn = $("generateBtn");

let generator = null;
let busy = false;
let selectedTone = "Warm and thoughtful";
let latestListing = null;
let toastTimer;

// Notification message
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

// Switch between empty, loading, result and error screens
function showState(state) {
  [
    "emptyState",
    "loadingState",
    "resultState",
    "errorState"
  ].forEach(id => $(id).classList.add("hidden"));

  $(state).classList.remove("hidden");
}

function setProgress(percent, title, message) {
  $("progressBar").style.width = `${percent}%`;

  if (title) $("loadingTitle").textContent = title;
  if (message) $("loadingText").textContent = message;
}

// Load the open-weight model once and reuse it
async function loadModel() {
  if (generator) return generator;

  $("modelStatus").textContent = "Loading open model...";

  setProgress(
    10,
    "Preparing your local AI...",
    "Downloading the model for the first time."
  );

  generator = await pipeline(
    "text2text-generation",
    "Xenova/flan-t5-small",
    {
      progress_callback: event => {
        if (event.status === "progress" && event.total) {
          const percent = Math.round(
            10 + (event.progress / 100) * 75
          );

          setProgress(
            Math.min(percent, 85),
            "Downloading the open model...",
            `${event.file || "Model file"}: ${Math.round(event.progress)}%`
          );
        }

        if (event.status === "done") {
          setProgress(
            90,
            "Model ready!",
            "Generating your product listing..."
          );
        }
      }
    }
  );

  $("modelStatus").textContent = "Open model ready";
  $("draftBadge").textContent = "LOCAL AI READY";

  return generator;
}

// Run a prompt through the model
async function generateText(model, prompt, maxTokens = 120) {
  const output = await model(prompt, {
    max_new_tokens: maxTokens,
    do_sample: false
  });

  return String(output?.[0]?.generated_text || "")
    .replace(/^\s*["'`]+|["'`]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Create local keyword suggestions from product details
function makeTags(text) {
  const stopWords = new Set([
    "with", "that", "this", "from", "your",
    "made", "have", "for", "and", "the",
    "are", "its", "you", "our", "who",
    "what", "into", "very", "can", "will",
    "product"
  ]);

  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];

  const uniqueWords = [...new Set(
    words.filter(word =>
      word.length > 2 && !stopWords.has(word)
    )
  )];

  return uniqueWords
    .slice(0, 10)
    .map(word => word.slice(0, 20));
}

// Fallback if the model produces an unusable result
function fallbackDraft(name, details) {
  const firstSentence =
    details.split(/[.!?]/).map(s => s.trim()).filter(Boolean)[0]
    || details;

  return {
    title: `${name} | ${category.value}`,
    description:
      `${name}\n\n${firstSentence}. ${details}\n\n` +
      `Please review all product details before publishing on ${platform.value}.`,
    tags: makeTags(`${name} ${category.value} ${details}`)
  };
}

// Main generation function
async function createListing() {
  if (busy) return;

  const name = productName.value.trim();
  const details = features.value.trim();

  if (!name || !details) {
    showToast("Enter a product name and its details first.");
    (!name ? productName : features).focus();
    return;
  }

  busy = true;
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";

  showState("loadingState");
  $("draftBadge").textContent = "GENERATING";

  try {
    const model = await loadModel();

    setProgress(
      92,
      "Writing your listing...",
      "Creating your title and description."
    );

    const context = `
      You write honest marketplace product listings.
      Writing style: ${selectedTone}.
      Marketplace: ${platform.value}.
      Category: ${category.value}.
      Product name: ${name}.
      Product details: ${details}.
      Only use facts supplied by the seller.
      Never invent product specifications or claims.
    `;

    const [title, description] = await Promise.all([
      generateText(
        model,
        `${context}
        Write one concise, appealing marketplace title.
        Return only the title.`,
        48
      ),

      generateText(
        model,
        `${context}
        Write a helpful product description in 3 to 5
        short sentences. Only use the known product facts.
        Return only the description.`,
        150
      )
    ]);

    if (
      title.length < 3 ||
      description.length < 12
    ) {
      latestListing = fallbackDraft(name, details);
    } else {
      latestListing = {
        title: title.replace(/^title:\s*/i, "").slice(0, 180),
        description: description.replace(
          /^description:\s*/i, ""
        ),
        tags: makeTags(
          `${name} ${category.value} ${details}`
        )
      };
    }

    renderListing(latestListing);

    $("modelStatus").textContent = "Open model ready";
    $("draftBadge").textContent = "DRAFT READY";

    setProgress(100);
    showState("resultState");

  } catch (error) {
    console.error("GigDraft model error:", error);

    generator = null;
    $("modelStatus").textContent = "Model unavailable";
    $("draftBadge").textContent = "NEEDS ATTENTION";

    $("errorMessage").textContent =
      "The model could not load. Check your internet connection, " +
      "then try again. Make sure you're running this project " +
      "through a local web server.";

    showState("errorState");

  } finally {
    busy = false;
    generateBtn.disabled = false;
    generateBtn.innerHTML =
      '✦ Generate listing <span>↗</span>';
  }
}

// Display the generated content safely
function renderListing(listing) {
  $("resultTitle").textContent = listing.title;
  $("resultDescription").textContent = listing.description;

  const tagContainer = $("resultTags");
  tagContainer.replaceChildren();

  listing.tags.forEach(tag => {
    const element = document.createElement("span");
    element.className = "tag";
    element.textContent = tag;
    tagContainer.appendChild(element);
  });
}

// Clipboard helper with a fallback for older browsers
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";

    document.body.appendChild(area);
    area.select();

    const success = document.execCommand("copy");
    area.remove();

    showToast(
      success ? "Copied to clipboard!" : "Copy failed. Please select the text."
    );
  }
}

// Form submission
form.addEventListener("submit", event => {
  event.preventDefault();
  createListing();
});

// Character counter
features.addEventListener("input", () => {
  $("charCount").textContent =
    `${features.value.length} / 1200`;
});

// Writing style selection
document.querySelectorAll(".tone-option").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tone-option").forEach(item => {
      item.classList.toggle("selected", item === button);
    });

    selectedTone = button.dataset.tone;
  });
});

// Fill the form with example product information
$("exampleBtn").addEventListener("click", () => {
  productName.value = "Hand-poured cedar candle";
  category.value = "Home & living";
  platform.value = "Etsy";

  features.value =
    "Soy wax candle in an amber glass jar. " +
    "Cedarwood and soft vanilla scent. " +
    "220 g candle, cotton wick, reusable jar. " +
    "Poured in small batches. Gift-ready packaging.";

  $("charCount").textContent =
    `${features.value.length} / 1200`;

  showToast("Example added. Generate your listing!");
});

// Copy the entire listing
$("copyAllBtn").addEventListener("click", () => {
  if (!latestListing) return;

  copyText(
    `TITLE\n${latestListing.title}\n\n` +
    `DESCRIPTION\n${latestListing.description}\n\n` +
    `SEARCH TAGS\n${latestListing.tags.join(", ")}`
  );
});

// Copy individual sections
document.querySelectorAll(".mini-copy").forEach(button => {
  button.addEventListener("click", () => {
    const target = $(button.dataset.copy);

    const text = button.dataset.copy === "resultTags"
      ? [...target.querySelectorAll(".tag")]
          .map(tag => tag.textContent)
          .join(", ")
      : target.textContent;

    copyText(text);
  });
});

// Regenerate and retry
$("regenerateBtn").addEventListener("click", createListing);
$("retryBtn").addEventListener("click", createListing);

// Information dialog
const dialog = $("infoDialog");

function openInfo() {
  if (!dialog.open) dialog.showModal();
}

$("helpBtn").addEventListener("click", openInfo);
$("howItWorks").addEventListener("click", openInfo);
$("closeDialog").addEventListener("click", () => dialog.close());
$("closeDialogBottom").addEventListener("click", () => dialog.close());

dialog.addEventListener("click", event => {
  if (event.target === dialog) dialog.close();
});
