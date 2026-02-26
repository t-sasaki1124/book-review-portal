const awsmobile = window.awsmobile;
const amplifyNamespace =
  window.aws_amplify ||
  window.Amplify ||
  window.amplify ||
  null;
const amplifyCore = amplifyNamespace?.Amplify || amplifyNamespace || null;
const Auth = amplifyNamespace?.Auth || amplifyCore?.Auth || null;

if (amplifyCore?.configure && awsmobile) {
  amplifyCore.configure(awsmobile);
}

const APP_MODE = window.APP_MODE || "app";
const IS_SAMPLE = APP_MODE === "sample";

const API_BASE_URL =
  awsmobile?.aws_cloud_logic_custom?.[0]?.endpoint ||
  "https://5blj3svatd.execute-api.ap-northeast-1.amazonaws.com/dev";
const API_BOOKS_URL = `${API_BASE_URL}/items`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRY_BASE_MS = 400;

const getAuthHeaders = async () => {
  if (IS_SAMPLE) return {};
  if (!Auth) return {};
  try {
    const session = await Auth.currentSession();
    return { Authorization: session.getIdToken().getJwtToken() };
  } catch {
    return {};
  }
};

const apiRequest = async (url, options = {}, retries = 8) => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    const isThrottling =
      response.status === 429 ||
      response.status === 503 ||
      (response.status === 500 &&
        (text.includes("throughput") ||
          text.includes("Throttling") ||
          text.includes("Rate exceeded")));
    if (
      isThrottling &&
      retries > 0
    ) {
      const attempt = 9 - retries;
      const jitter = Math.floor(Math.random() * 120);
      await sleep(RETRY_BASE_MS * attempt + jitter);
      return apiRequest(url, options, retries - 1);
    }
    throw new Error(`api_error_${response.status}:${text}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

let books = [];
let currentUserId = null;

const sortSelect = document.getElementById("sortSelect");
const searchInput = document.getElementById("searchInput");
const tagFilter = document.getElementById("tagFilter");
const ratingFilter = document.getElementById("ratingFilter");
const cardGrid = document.getElementById("cardGrid");
const totalCount = document.getElementById("totalCount");
const viewListButton = document.getElementById("viewListButton");
const viewGridButton = document.getElementById("viewGridButton");
const exportButton = document.getElementById("exportButton");
const importButton = document.getElementById("importButton");
const importFile = document.getElementById("importFile");
const importDialog = document.getElementById("importDialog");
const clearAllButton = document.getElementById("clearAllButton");
const editDialog = document.getElementById("editDialog");
const editForm = document.getElementById("editForm");
const editDialogTitle = document.getElementById("editDialogTitle");
const closeDialogButton = document.getElementById("closeDialog");
const editTitle = document.getElementById("editTitle");
const editAuthor = document.getElementById("editAuthor");
const editRating = document.getElementById("editRating");
const editTags = document.getElementById("editTags");
const editSelection = document.getElementById("editSelection");
const editImpressions = document.getElementById("editImpressions");
const editAffiliateUrl = document.getElementById("editAffiliateUrl");
const editRakutenUrl = document.getElementById("editRakutenUrl");
const editCoverImage = document.getElementById("editCoverImage");
const coverPreview = document.getElementById("coverPreview");
const clearCoverImage = document.getElementById("clearCoverImage");
const deleteBook = document.getElementById("deleteBook");
const addBookButton = document.getElementById("addBookButton");
const signOutButton = document.getElementById("signOutButton");
const userDisplay = document.getElementById("userDisplay");
const disableIfSample = (element) => {
  if (!element) return;
  element.disabled = true;
  element.classList.add("is-disabled");
  element.setAttribute("aria-disabled", "true");
};

let editingId = null;
let pendingCoverImage = "";
let isCreateMode = false;
let lastReorderOrders = new Set();
let viewMode = "list";
let sampleBooks = [];
const setUserDisplay = (value) => {
  if (!userDisplay) return;
  userDisplay.textContent = value || "-";
};

if (IS_SAMPLE) {
  disableIfSample(addBookButton);
  disableIfSample(importButton);
  disableIfSample(exportButton);
  disableIfSample(clearAllButton);
  setUserDisplay("ゲスト");
  const accountGroup = signOutButton?.closest?.(".control-group");
  if (accountGroup) {
    accountGroup.style.display = "none";
  }
}

const ensureAuthenticated = async () => {
  if (IS_SAMPLE) {
    await loadBooksFromApi();
    refreshView();
    return;
  }
  if (!Auth) {
    window.location.href = "login.html";
    return;
  }
  try {
    const user = await Auth.currentAuthenticatedUser();
    currentUserId = user?.attributes?.sub || user?.username || null;
    setUserDisplay(user?.attributes?.email || user?.username || currentUserId);
    await loadBooksFromApi();
    refreshView();
  } catch {
    window.location.href = "login.html";
  }
};

const createStars = (rating) => {
  const maxStars = 5;
  return "★".repeat(rating) + "☆".repeat(maxStars - rating);
};

const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, "");

const nextOrderNumber = () =>
  books.length ? Math.max(...books.map((book) => book.order)) + 1 : 1;

const setViewMode = (mode) => {
  viewMode = mode;
  cardGrid.classList.toggle("list-view", mode === "list");
  cardGrid.classList.toggle("grid-view", mode === "grid");
  viewListButton.classList.toggle("is-active", mode === "list");
  viewGridButton.classList.toggle("is-active", mode === "grid");
};

const updateTagOptions = () => {
  const selected = tagFilter.value;
  const tags = Array.from(
    new Set(books.flatMap((book) => book.tags || []))
  ).sort((a, b) => a.localeCompare(b, "ja", { sensitivity: "base" }));
  tagFilter.innerHTML = `<option value="">すべて</option>${tags
    .map((tag) => `<option value="${tag}">${tag}</option>`)
    .join("")}`;
  tagFilter.value = tags.includes(selected) ? selected : "";
};

const ensureCurrentUser = async () => {
  if (IS_SAMPLE) return "sample";
  if (currentUserId) return currentUserId;
  if (!Auth) return null;
  try {
    const user = await Auth.currentAuthenticatedUser();
    currentUserId = user?.attributes?.sub || user?.username || null;
    return currentUserId;
  } catch {
    return null;
  }
};

const sanitizeBook = (raw, fallbackOrder) => {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim();
  if (!title) return null;
  const author = String(raw.author || "").trim();
  const rating = Number(raw.rating);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const affiliateUrl = String(raw.affiliateUrl || "").trim();
  const rakutenUrl = String(raw.rakutenUrl || "").trim();
  const id = String(raw.id || "").trim();
  const userId = String(raw.userId || "").trim();
  const coverImage = String(raw.coverImage || "").trim();
  const notes = raw.notes || {};
  const selectionBackground = Array.isArray(notes.selectionBackground)
    ? notes.selectionBackground.map((note) => String(note)).filter(Boolean)
    : [];
  const impressions = Array.isArray(notes.impressions)
    ? notes.impressions.map((note) => String(note)).filter(Boolean)
    : [];
  return {
    order: Number(raw.order) || fallbackOrder,
    id,
    userId,
    title,
    author,
    rating: rating >= 1 && rating <= 5 ? rating : 3,
    tags,
    affiliateUrl,
    rakutenUrl,
    coverImage,
    notes: { selectionBackground, impressions },
  };
};

const ensureId = (book) => {
  if (book.id) return book;
  return {
    ...book,
    id: crypto.randomUUID?.() || String(Date.now()),
  };
};

const prepareBookForSave = (book) => ({
  ...ensureId(book),
  userId: currentUserId,
});

const loadBooksFromApi = async () => {
  if (IS_SAMPLE) {
    await loadSampleBooks();
    books = sampleBooks.map((item) => ({ ...item }));
    return;
  }
  const userId = await ensureCurrentUser();
  if (!userId) {
    books = [];
    return;
  }
  const url = new URL(API_BOOKS_URL);
  url.searchParams.set("userId", userId);
  const data = await apiRequest(url.toString());
  const sanitized = Array.isArray(data)
    ? data.map((item, index) => sanitizeBook(item, index + 1)).filter(Boolean)
    : [];
  books = sanitized.filter((item) => item.userId === userId);
};

const createBookApi = async (payload) => {
  if (IS_SAMPLE) return null;
  return apiRequest(API_BOOKS_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

const updateBookApi = async (id, payload) => {
  if (IS_SAMPLE) return null;
  return apiRequest(`${API_BOOKS_URL}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

const deleteBookApi = async (id) => {
  if (IS_SAMPLE) return null;
  const userId = await ensureCurrentUser();
  const url = new URL(`${API_BOOKS_URL}/${id}`);
  if (userId) {
    url.searchParams.set("userId", userId);
  }
  return apiRequest(url.toString(), { method: "DELETE" });
};

const replaceAllBooksApi = async (items) => {
  if (IS_SAMPLE) return;
  const userId = await ensureCurrentUser();
  if (!userId) return;
  const url = new URL(API_BOOKS_URL);
  url.searchParams.set("userId", userId);
  const existing = await apiRequest(url.toString());
  if (Array.isArray(existing)) {
    for (const item of existing) {
      if (item.id) {
        await deleteBookApi(item.id);
        await sleep(400);
      }
    }
  }
  for (const item of items) {
    await createBookApi(item);
    await sleep(400);
  }
};

const renderNotes = (notes) => {
  const sections = [];
  if (notes.selectionBackground?.length) {
    sections.push(
      `<div class="tag">選定背景</div>
       <ul>${notes.selectionBackground
         .map((note) => `<li>${note}</li>`)
         .join("")}</ul>`
    );
  }
  if (notes.impressions?.length) {
    sections.push(
      `<div class="tag">印象点</div>
       <ul>${notes.impressions.map((note) => `<li>${note}</li>`).join("")}</ul>`
    );
  }

  if (!sections.length) {
    return "<p>メモを追加してください。</p>";
  }

  return sections.join("");
};

const renderCards = (items) => {
  cardGrid.innerHTML = "";
  const allowEdit = !IS_SAMPLE;
  const allowDrag = !IS_SAMPLE;

  if (!items.length) {
    cardGrid.innerHTML = `
      <div class="empty-state">
        <p>該当する書籍がありませんでした。</p>
        ${
          allowEdit
            ? `<button class="button" type="button" data-action="import-sample">
                サンプルをインポートして表示する
              </button>`
            : ""
        }
      </div>
    `;
    return;
  }

  items.forEach((book) => {
    const affiliateHref = book.affiliateUrl || "";
    const rakutenHref = book.rakutenUrl || "";
    const coverContent = book.coverImage
      ? `<img src="${book.coverImage}" alt="${book.title}の表紙" />`
      : `<span>画像なし</span>`;

    const card = document.createElement("article");
    card.className = "card";
    if (lastReorderOrders.has(book.order)) {
      card.classList.add("reordered");
    }
    card.dataset.order = String(book.order);
    card.innerHTML = `
      ${
        allowDrag
          ? `<div class="drag-handle" draggable="true" aria-label="並び替え"></div>`
          : ""
      }
      <div class="card-cover">${coverContent}</div>
      <div class="card-content">
        <div class="card-header">
          <div>
            <div class="book-title">${book.title}</div>
            <div class="book-author">${book.author}</div>
          </div>
          <span class="card-number">No.${book.order}</span>
        </div>
        <div class="rating">
          <span class="stars">${createStars(book.rating)}</span>
          <span>${book.rating} / 5</span>
        </div>
        <div class="card-tags">
          ${book.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
        </div>
        <div class="memo">
          ${renderNotes(book.notes)}
        </div>
        <div class="card-actions">
          ${
            affiliateHref
              ? `<a class="button amazon" href="${affiliateHref}" target="_blank" rel="noreferrer">Amazonで見る</a>`
              : ""
          }
          ${
            rakutenHref
              ? `<a class="button rakuten" href="${rakutenHref}" target="_blank" rel="noreferrer">楽天で見る</a>`
              : ""
          }
          ${
            allowEdit
              ? `<button class="button" type="button" data-edit="${book.id}">
                  編集
                </button>`
              : ""
          }
        </div>
      </div>
    `;
    cardGrid.appendChild(card);
  });

  if (lastReorderOrders.size) {
    const reorderedCards = cardGrid.querySelectorAll(".card.reordered");
    window.setTimeout(() => {
      reorderedCards.forEach((card) => card.classList.remove("reordered"));
      lastReorderOrders = new Set();
    }, 750);
  }
};

const loadSampleBooks = async () => {
  if (sampleBooks.length) return;
  try {
    let data = null;
    if (Array.isArray(window.SAMPLE_BOOKS)) {
      data = window.SAMPLE_BOOKS;
    } else {
      const response = await fetch("./sample.json", { cache: "no-store" });
      if (!response.ok) {
        alert("sample.json が見つかりませんでした。");
        return;
      }
      data = await response.json();
    }
    if (!Array.isArray(data)) {
      alert("sample.json の形式が正しくありません。");
      return;
    }
    sampleBooks = data
      .map((item, index) => sanitizeBook(item, index + 1))
      .filter(Boolean);
    if (!sampleBooks.length) {
      alert("sample.json の中身が空でした。");
    }
  } catch {
    alert("sample.json の読み込みに失敗しました。");
  }
};

const getSortedBooks = (items, sortKey) => {
  const sorted = [...items];
  const [key, direction] = sortKey.split("-");
  const isAsc = direction === "asc";

  const compareText = (a, b) =>
    a.localeCompare(b, "ja", { sensitivity: "base" });

  const getValue = (book) => {
    if (key === "order") return book.order;
    if (key === "rating") return book.rating;
    if (key === "title") return book.title;
    if (key === "author") return book.author;
    return book.order;
  };

  sorted.sort((a, b) => {
    const aValue = getValue(a);
    const bValue = getValue(b);
    if (typeof aValue === "string") {
      return isAsc ? compareText(aValue, bValue) : compareText(bValue, aValue);
    }
    return isAsc ? aValue - bValue : bValue - aValue;
  });

  return sorted;
};

const getFilteredBooks = (items, keyword, tag, rating) => {
  let result = items;
  if (keyword) {
    const normalized = normalizeText(keyword);
    result = result.filter((book) => {
      const haystack = [
        book.title,
        book.author,
        (book.tags || []).join(" "),
        JSON.stringify(book.notes || {}),
      ]
        .join(" ")
        .toLowerCase();
      return normalizeText(haystack).includes(normalized);
    });
  }
  if (tag) {
    result = result.filter((book) => (book.tags || []).includes(tag));
  }
  if (rating) {
    const ratingNumber = Number(rating);
    result = result.filter((book) => book.rating === ratingNumber);
  }
  return result;
};

const refreshView = () => {
  updateTagOptions();
  const filtered = getFilteredBooks(
    books,
    searchInput.value.trim(),
    tagFilter.value,
    ratingFilter.value
  );
  const sorted = getSortedBooks(filtered, sortSelect.value);
  if (books.length === 0) {
    totalCount.textContent = "0";
    renderCards([]);
    return;
  }
  totalCount.textContent = String(sorted.length);
  renderCards(sorted);
};

const chooseImportMode = () =>
  new Promise((resolve) => {
    const handler = (event) => {
      const button = event.target.closest("[data-import-choice]");
      if (!button) return;
      const choice = button.dataset.importChoice;
      importDialog.close();
      importDialog.removeEventListener("click", handler);
      resolve(choice);
    };
    importDialog.addEventListener("click", handler);
    importDialog.showModal();
  });

sortSelect.addEventListener("change", refreshView);
searchInput.addEventListener("input", refreshView);
tagFilter.addEventListener("change", refreshView);
ratingFilter.addEventListener("change", refreshView);
viewListButton.addEventListener("click", () => setViewMode("list"));
viewGridButton.addEventListener("click", () => setViewMode("grid"));
exportButton.addEventListener("click", () => {
  if (IS_SAMPLE) return;
  const blob = new Blob([JSON.stringify(books, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}${pad(now.getHours())}${pad(now.getMinutes())}`;
  anchor.download = `books-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});
importButton.addEventListener("click", () => {
  if (IS_SAMPLE) return;
  importFile.value = "";
  importFile.click();
});
importFile.addEventListener("change", async (event) => {
  if (IS_SAMPLE) return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const userId = await ensureCurrentUser();
    if (!userId) {
      alert("ログインが必要です。");
      return;
    }
    await loadBooksFromApi();
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      alert("JSONの形式が正しくありません。");
      return;
    }
    const sanitized = parsed
      .map((item, index) => sanitizeBook(item, index + 1))
      .filter(Boolean);
    if (!sanitized.length) {
      alert("取り込めるデータがありませんでした。");
      return;
    }
    const choice = await chooseImportMode();
    if (choice === "cancel") {
      return;
    }
    if (choice === "overwrite") {
      const normalized = sanitized.map((book, index) =>
        prepareBookForSave({ ...book, order: index + 1 })
      );
      await replaceAllBooksApi(normalized);
    } else {
      let order = nextOrderNumber();
      for (const book of sanitized) {
        const item = prepareBookForSave({ ...book, order });
        await createBookApi(item);
        await sleep(400);
        order += 1;
      }
    }
    await loadBooksFromApi();
    refreshView();
  } catch (error) {
    alert(`ファイルの読み込みに失敗しました。(${error?.message || "unknown"})`);
  }
});

clearAllButton.addEventListener("click", () => {
  if (IS_SAMPLE) return;
  const confirmed = confirm("全件削除しますか？この操作は元に戻せません。");
  if (!confirmed) return;
  replaceAllBooksApi([])
    .then(loadBooksFromApi)
    .then(refreshView)
    .catch((error) =>
      alert(`全件削除に失敗しました。(${error?.message || "unknown"})`)
    );
});

cardGrid.addEventListener("click", (event) => {
  if (IS_SAMPLE) return;
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset.action;
  if (action === "import-sample") {
    loadSampleBooks().then(async () => {
      if (!sampleBooks.length) return;
      const userId = await ensureCurrentUser();
      if (!userId) {
        alert("ログインが必要です。");
        return;
      }
      const normalized = sampleBooks.map((book, index) =>
        prepareBookForSave({ ...book, order: index + 1 })
      );
      await replaceAllBooksApi(normalized);
      await loadBooksFromApi();
      refreshView();
    });
    return;
  }
  const editOrder = target.dataset.edit;

  if (editOrder) {
    openEditDialog(editOrder);
  }
});

let draggedOrder = null;

const canDrag = () =>
  sortSelect.value === "order-asc" &&
  searchInput.value.trim() === "" &&
  tagFilter.value === "" &&
  ratingFilter.value === "" &&
  viewMode === "list";

const animateReorder = (previousPositions) => {
  if (!previousPositions || previousPositions.size === 0) return;
  window.requestAnimationFrame(() => {
    cardGrid.querySelectorAll(".card").forEach((card) => {
      const order = Number(card.dataset.order);
      const prev = previousPositions.get(order);
      if (!prev) return;
      const next = card.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      card.style.transition = "transform 0s";
      window.requestAnimationFrame(() => {
        card.style.transition = "transform 600ms ease";
        card.style.transform = "translate(0, 0)";
      });
      card.addEventListener(
        "transitionend",
        () => {
          card.style.transition = "";
          card.style.transform = "";
        },
        { once: true }
      );
    });
  });
};

cardGrid.addEventListener("dragstart", (event) => {
  if (IS_SAMPLE) return;
  const handle = event.target.closest?.(".drag-handle");
  if (!handle) return;
  if (!canDrag()) {
    event.preventDefault();
    alert("並び替えは「番号: 昇順」かつ検索/フィルタなし、リスト表示で行ってください。");
    return;
  }
  const card = handle.closest(".card");
  if (!card) return;
  draggedOrder = Number(card.dataset.order);
  event.dataTransfer?.setData("text/plain", String(draggedOrder));
  event.dataTransfer?.setDragImage(card, 20, 20);
});

cardGrid.addEventListener("dragover", (event) => {
  if (IS_SAMPLE) return;
  if (draggedOrder === null) return;
  const card = event.target.closest?.(".card");
  if (!card) return;
  event.preventDefault();
  card.classList.add("drag-over");
});

cardGrid.addEventListener("dragleave", (event) => {
  if (IS_SAMPLE) return;
  const card = event.target.closest?.(".card");
  if (!card) return;
  card.classList.remove("drag-over");
});

cardGrid.addEventListener("drop", (event) => {
  if (IS_SAMPLE) return;
  if (draggedOrder === null) return;
  const card = event.target.closest?.(".card");
  if (!card) return;
  event.preventDefault();
  card.classList.remove("drag-over");
  const previousPositions = new Map(
    Array.from(cardGrid.querySelectorAll(".card"), (cardItem) => [
      Number(cardItem.dataset.order),
      cardItem.getBoundingClientRect(),
    ])
  );
  const targetOrder = Number(card.dataset.order);
  if (targetOrder === draggedOrder) {
    draggedOrder = null;
    return;
  }
  const dragged = books.find((item) => item.order === draggedOrder);
  const target = books.find((item) => item.order === targetOrder);
  if (!dragged || !target) {
    draggedOrder = null;
    return;
  }
  const temp = dragged.order;
  dragged.order = target.order;
  target.order = temp;
  Promise.all([updateBookApi(dragged.id, dragged), updateBookApi(target.id, target)])
    .then(loadBooksFromApi)
    .then(() => {
      lastReorderOrders = new Set([dragged.order, target.order]);
      draggedOrder = null;
      refreshView();
      animateReorder(previousPositions);
    })
    .catch(() => alert("並び替えに失敗しました。"));
});

const openEditDialog = (id) => {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  isCreateMode = false;
  editingId = id;
  editDialogTitle.textContent = "書評を編集";
  editTitle.value = book.title;
  editAuthor.value = book.author;
  editRating.value = String(book.rating ?? 3);
  editTags.value = book.tags.map((tag) => `#${tag}`).join(" ");
  editSelection.value = (book.notes.selectionBackground || []).join("\n");
  editImpressions.value = (book.notes.impressions || []).join("\n");
  editAffiliateUrl.value = book.affiliateUrl || "";
  editRakutenUrl.value = book.rakutenUrl || "";
  pendingCoverImage = book.coverImage || "";
  coverPreview.src = pendingCoverImage;
  coverPreview.style.display = pendingCoverImage ? "block" : "none";
  editCoverImage.value = "";
  deleteBook.style.display = "inline-flex";
  editDialog.showModal();
};

const openCreateDialog = () => {
  isCreateMode = true;
  editingId = null;
  editDialogTitle.textContent = "新しい本を追加";
  editTitle.value = "";
  editAuthor.value = "";
  editRating.value = "3";
  editTags.value = "";
  editSelection.value = "";
  editImpressions.value = "";
  editAffiliateUrl.value = "";
  editRakutenUrl.value = "";
  pendingCoverImage = "";
  coverPreview.src = "";
  coverPreview.style.display = "none";
  editCoverImage.value = "";
  deleteBook.style.display = "none";
  editDialog.showModal();
};

const parseLines = (value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const parseTags = (value) => {
  if (!value.trim()) return [];
  return value
    .replace(/,/g, " ")
    .split(" ")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/^#/, ""));
};

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = editTitle.value.trim();
  if (!title) {
    alert("タイトルは必須です。");
    return;
  }
  const userId = await ensureCurrentUser();
  if (!userId) {
    alert("ログインが必要です。");
    return;
  }
  const author = editAuthor.value.trim();

  const payload = {
    title,
    author,
    rating: Number(editRating.value) || 3,
    tags: parseTags(editTags.value),
    affiliateUrl: editAffiliateUrl.value.trim(),
    rakutenUrl: editRakutenUrl.value.trim(),
    coverImage: pendingCoverImage,
    notes: {
      selectionBackground: parseLines(editSelection.value),
      impressions: parseLines(editImpressions.value),
    },
  };

  try {
    if (isCreateMode) {
      const newBook = prepareBookForSave({
        order: nextOrderNumber(),
        rating: 3,
        ...payload,
      });
      await createBookApi(newBook);
      await loadBooksFromApi();
      editDialog.close();
      refreshView();
      return;
    }

    if (!editingId) return;
    const book = books.find((item) => item.id === editingId);
    if (!book) return;
    const updated = prepareBookForSave({ ...book, ...payload, id: book.id });
    await updateBookApi(book.id, updated);
    await loadBooksFromApi();
    editDialog.close();
    refreshView();
  } catch {
    alert("保存に失敗しました。");
  }
});

closeDialogButton.addEventListener("click", () => {
  editDialog.close();
});

deleteBook.addEventListener("click", () => {
  if (!editingId) return;
  const book = books.find((item) => item.id === editingId);
  if (!book) return;
  const confirmed = confirm(`「${book.title}」を削除しますか？`);
  if (!confirmed) return;
  deleteBookApi(book.id)
    .then(loadBooksFromApi)
    .then(() => {
      editDialog.close();
      refreshView();
    })
    .catch((error) =>
      alert(`削除に失敗しました。(${error?.message || "unknown"})`)
    );
});

addBookButton.addEventListener("click", () => {
  if (IS_SAMPLE) return;
  openCreateDialog();
});

clearCoverImage.addEventListener("click", () => {
  pendingCoverImage = "";
  coverPreview.src = "";
  coverPreview.style.display = "none";
  editCoverImage.value = "";
});

editCoverImage.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/image\/(png|jpeg)/.test(file.type)) {
    alert("png か jpg の画像を選んでください。");
    return;
  }
  pendingCoverImage = await resizeImage(file, 320, 420, 0.85);
  coverPreview.src = pendingCoverImage;
  coverPreview.style.display = "block";
});

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    if (!Auth) return;
    try {
      await Auth.signOut();
      currentUserId = null;
      setUserDisplay("-");
      books = [];
      refreshView();
      window.location.href = "login.html";
    } catch {
      alert("ログアウトに失敗しました。");
    }
  });
}

const resizeImage = (file, maxWidth, maxHeight, quality) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("");
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

setViewMode("list");
refreshView();
ensureAuthenticated();
