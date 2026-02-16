const books = [
  {
    order: 20,
    title: "イシューからはじめよ",
    author: "安宅和人",
    rating: 4,
    tags: ["思考法", "仕事術"],
    affiliateUrl: "",
    coverImage: "",
    notes: {
      selectionBackground: [
        "解くべき問題の見極め方を学びたかった。",
        "仕事の進め方を見直すタイミングだった。",
      ],
      impressions: [],
    },
  },
  {
    order: 21,
    title: "勝負眼",
    author: "藤田晋",
    rating: 5,
    tags: ["ビジネス", "スポーツ", "エッセイ"],
    affiliateUrl: "",
    coverImage: "",
    notes: {
      impressions: [
        "文章の書き方がうまく、読んでいて飽きない。面白い。",
        "藤田氏のサッカーや競馬に対する情熱がすごい。人生を楽しんでいる印象。",
        "すごい酒飲み。読んでいると酒飲みでもパフォーマンスが出せると錯覚しそうになる。",
        "彼は酒飲みでも業務が成立するほどのバイタリティがあるからこそで、勘違いしないよう注意が必要。",
        "息子が10歳くらいという話が出てきて印象に残った。",
      ],
      selectionBackground: [],
    },
  },
  {
    order: 22,
    title: "「話が面白い人」は何をどう読んでいるのか",
    author: "三宅香帆",
    rating: 4,
    tags: ["読書術", "伝える力"],
    affiliateUrl: "",
    coverImage: "",
    notes: {
      impressions: [
        "比較、抽象、発見、流行、不易の5つに分類することを意識して伝えると良い。",
      ],
      selectionBackground: [],
    },
  },
  {
    order: 23,
    title: "なぜ、働いていると本が読めなくなるのか",
    author: "三宅香帆",
    rating: 5,
    tags: ["読書論", "働き方"],
    affiliateUrl: "",
    coverImage: "",
    notes: {
      impressions: [
        "読書とはノイズである。",
        "現代人には受け入れられにくい感覚。",
        "コスパ・タイパ重視で雑音を嫌う流れ（自分もそうだった）でも、それがあるべき姿とは違うと感じた。",
        "人生を有意義にするには雑音も必要で、見たい動画だけを見る・やりたいことだけやるのは先がない気がする。",
      ],
      selectionBackground: [],
    },
  },
];

const sortSelect = document.getElementById("sortSelect");
const searchInput = document.getElementById("searchInput");
const cardGrid = document.getElementById("cardGrid");
const totalCount = document.getElementById("totalCount");
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
const editCoverImage = document.getElementById("editCoverImage");
const coverPreview = document.getElementById("coverPreview");
const clearCoverImage = document.getElementById("clearCoverImage");
const deleteBook = document.getElementById("deleteBook");
const addBookButton = document.getElementById("addBookButton");

let editingOrder = null;
let pendingCoverImage = "";
let isCreateMode = false;
let lastReorderOrders = new Set();

const createStars = (rating) => {
  const maxStars = 5;
  return "★".repeat(rating) + "☆".repeat(maxStars - rating);
};

const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, "");

const nextOrderNumber = () =>
  books.length ? Math.max(...books.map((book) => book.order)) + 1 : 1;

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
    const affiliateLabel = book.affiliateUrl
      ? "Amazonで見る"
      : "Amazonリンクを追加";
    const affiliateHref = book.affiliateUrl || "#";
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
          <a class="button primary" href="${affiliateHref}" target="_blank" rel="noreferrer">
            ${affiliateLabel}
          </a>
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
    }, 350);
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

const getFilteredBooks = (items, keyword) => {
  if (!keyword) return items;
  const normalized = normalizeText(keyword);
  return items.filter((book) => {
    const haystack = [
      book.title,
      book.author,
      book.tags.join(" "),
      JSON.stringify(book.notes),
    ]
      .join(" ")
      .toLowerCase();
    return normalizeText(haystack).includes(normalized);
  });
};

const refreshView = () => {
  const filtered = getFilteredBooks(books, searchInput.value.trim());
  const sorted = getSortedBooks(filtered, sortSelect.value);
  renderCards(sorted);
};

sortSelect.addEventListener("change", refreshView);
searchInput.addEventListener("input", refreshView);

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
  sortSelect.value === "order-asc" && searchInput.value.trim() === "";

cardGrid.addEventListener("dragstart", (event) => {
  const handle = event.target.closest?.(".drag-handle");
  if (!handle) return;
  if (!canDrag()) {
    event.preventDefault();
    alert("並び替えは「番号: 昇順」かつ検索なしで行ってください。");
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
  lastReorderOrders = new Set([dragged.order, target.order]);
  draggedOrder = null;
  refreshView();
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
    editDialog.close();
    refreshView();
    return;
  }

  if (editingOrder === null) return;
  const book = books.find((item) => item.order === editingOrder);
  if (!book) return;
  Object.assign(book, payload);
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

refreshView();
