const STORAGE_KEY = "bookReviewPortal.books";

const loadBooksFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveBooksToStorage = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
};

let books = loadBooksFromStorage();

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

let editingOrder = null;
let pendingCoverImage = "";
let isCreateMode = false;
let lastReorderOrders = new Set();
let viewMode = "list";

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
  totalCount.textContent = items.length;

  if (!items.length) {
    cardGrid.innerHTML = `
      <div class="empty-state">
        <p>該当する書籍がありませんでした。</p>
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
      <div class="drag-handle" draggable="true" aria-label="並び替え"></div>
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
          <button class="button" type="button" data-edit="${book.order}">
            編集
          </button>
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
  renderCards(sorted);
};

sortSelect.addEventListener("change", refreshView);
searchInput.addEventListener("input", refreshView);
tagFilter.addEventListener("change", refreshView);
ratingFilter.addEventListener("change", refreshView);
viewListButton.addEventListener("click", () => setViewMode("list"));
viewGridButton.addEventListener("click", () => setViewMode("grid"));
exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(books, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "books.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});
importButton.addEventListener("click", () => {
  importFile.value = "";
  importFile.click();
});
importFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
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
    const overwrite = confirm(
      "インポートしたデータで上書きしますか？\nOK: 上書き / キャンセル: 既存に追加"
    );
    if (overwrite) {
      books = sanitized.map((book, index) => ({ ...book, order: index + 1 }));
    } else {
      sanitized.forEach((book) => {
        books.push({ ...book, order: nextOrderNumber() });
      });
    }
    saveBooksToStorage();
    refreshView();
  } catch {
    alert("ファイルの読み込みに失敗しました。");
  }
});

cardGrid.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const editOrder = target.dataset.edit;

  if (editOrder) {
    const order = Number(editOrder);
    openEditDialog(order);
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
  if (draggedOrder === null) return;
  const card = event.target.closest?.(".card");
  if (!card) return;
  event.preventDefault();
  card.classList.add("drag-over");
});

cardGrid.addEventListener("dragleave", (event) => {
  const card = event.target.closest?.(".card");
  if (!card) return;
  card.classList.remove("drag-over");
});

cardGrid.addEventListener("drop", (event) => {
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
  saveBooksToStorage();
  lastReorderOrders = new Set([dragged.order, target.order]);
  draggedOrder = null;
  refreshView();
  animateReorder(previousPositions);
});

const openEditDialog = (order) => {
  const book = books.find((item) => item.order === order);
  if (!book) return;
  isCreateMode = false;
  editingOrder = order;
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
  editingOrder = null;
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

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = editTitle.value.trim();
  if (!title) {
    alert("タイトルは必須です。");
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

  if (isCreateMode) {
    books.push({
      order: nextOrderNumber(),
      rating: 3,
      ...payload,
    });
    saveBooksToStorage();
    editDialog.close();
    refreshView();
    return;
  }

  if (editingOrder === null) return;
  const book = books.find((item) => item.order === editingOrder);
  if (!book) return;
  Object.assign(book, payload);
  saveBooksToStorage();
  editDialog.close();
  refreshView();
});

closeDialogButton.addEventListener("click", () => {
  editDialog.close();
});

deleteBook.addEventListener("click", () => {
  if (editingOrder === null) return;
  const book = books.find((item) => item.order === editingOrder);
  if (!book) return;
  const confirmed = confirm(`「${book.title}」を削除しますか？`);
  if (!confirmed) return;
  const index = books.findIndex((item) => item.order === editingOrder);
  if (index === -1) return;
  books.splice(index, 1);
  saveBooksToStorage();
  editDialog.close();
  refreshView();
});

addBookButton.addEventListener("click", () => {
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
