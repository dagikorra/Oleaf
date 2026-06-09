const reservationBase = "https://brightnest.example/reserve";

const tasks = [
  {
    id: 1,
    title: "Maple Ridge deep clean",
    customer: "Maya Chen",
    cleaner: "Avery",
    window: "9:00 AM - 12:00 PM",
    address: "1420 Maple Ridge Dr",
    status: "scheduled",
    price: 260
  },
  {
    id: 2,
    title: "Northside office refresh",
    customer: "Javier Morales",
    cleaner: "Jordan",
    window: "10:30 AM - 1:30 PM",
    address: "80 Northside Pkwy",
    status: "in-progress",
    price: 180
  },
  {
    id: 3,
    title: "Lakeview standard clean",
    customer: "Priya Shah",
    cleaner: "Sam",
    window: "1:00 PM - 3:30 PM",
    address: "27 Lakeview Ct",
    status: "completed",
    price: 145
  }
];

let selectedTaskId = 1;
let currentRole = "admin";

const columns = [
  ["scheduled", "Scheduled"],
  ["in-progress", "In progress"],
  ["completed", "Completed"]
];

const serviceType = document.querySelector("#serviceType");
const rooms = document.querySelector("#rooms");
const estimate = document.querySelector("#estimate");
const estimateLabel = document.querySelector("#estimateLabel");
const bookingDate = document.querySelector("#bookingDate");
const bookingTime = document.querySelector("#bookingTime");
const address = document.querySelector("#address");
const qrImage = document.querySelector("#qrImage");
const reservationNote = document.querySelector("#reservationNote");
const taskColumns = document.querySelector("#taskColumns");
const activeRole = document.querySelector("#activeRole");
const toast = document.querySelector("#toast");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function selectedTask() {
  return tasks.find((task) => task.id === selectedTaskId) || tasks[0];
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3000);
}

function updateEstimate() {
  const selectedOption = serviceType.selectedOptions[0];
  const basePrice = Number(selectedOption.dataset.price);
  const roomCount = Number(rooms.value || 1);
  const isQuote = serviceType.value === "house-quote";
  const total = basePrice + (isQuote ? 0 : Math.max(roomCount - 2, 0) * 20);

  estimateLabel.textContent = isQuote ? "Quote status" : "Estimated total";
  estimate.textContent = isQuote ? "Quote" : money(total);
  document.querySelector(".submit-btn").textContent = isQuote ? "Request quote" : "Reserve and pay";
  updateQr();
}

function updateQr() {
  const params = new URLSearchParams({
    service: serviceType.value,
    date: bookingDate.value,
    time: bookingTime.value,
    address: address.value
  });
  const reservationUrl = `${reservationBase}?${params.toString()}`;
  qrImage.onerror = () => {
    qrImage.onerror = null;
    qrImage.src = fallbackQr(reservationUrl);
  };
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=1&data=${encodeURIComponent(reservationUrl)}`;
}

function fallbackQr(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  const cells = Array.from({ length: 121 }, (_, index) => {
    const x = index % 11;
    const y = Math.floor(index / 11);
    const finder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
    const filled = finder || ((hash >> ((x + y * 3) % 24)) & 1);
    return filled ? `<rect x="${x * 8}" y="${y * 8}" width="7" height="7"/>` : "";
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88"><rect width="88" height="88" fill="white"/><g fill="#10233d">${cells}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderTasks() {
  taskColumns.innerHTML = columns.map(([status, label]) => {
    const matchingTasks = tasks.filter((task) => task.status === status);
    const cards = matchingTasks.map((task) => `
      <button class="task-card ${task.id === selectedTaskId ? "active" : ""}" type="button" data-task="${task.id}">
        <strong>${task.title}</strong>
        <span class="task-meta"><span>${task.cleaner}</span><span>${task.window}</span></span>
        <span class="task-meta"><span>${task.address}</span><span>${money(task.price)}</span></span>
      </button>
    `).join("");

    return `
      <section class="task-column">
        <div class="column-title"><span>${label}</span><span>${matchingTasks.length}</span></div>
        ${cards}
      </section>
    `;
  }).join("");

  document.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTaskId = Number(button.dataset.task);
      renderTasks();
      renderDetail();
    });
  });
}

function renderDetail() {
  const task = selectedTask();
  document.querySelector("#detailTitle").textContent = task.title;
  document.querySelector("#detailCleaner").textContent = task.cleaner;
  document.querySelector("#detailCustomer").textContent = task.customer;
  document.querySelector("#detailWindow").textContent = task.window;
  document.querySelector("#assignCleaner").value = task.cleaner;
}

function updateTaskStatus(status) {
  const task = selectedTask();
  task.status = status;
  renderTasks();
  renderDetail();

  if (status === "completed") {
    document.querySelector("#noticeTitle").textContent = "Completion confirmed";
    document.querySelector("#noticeBody").textContent = `${task.customer} will receive a completed-clean confirmation for ${task.title}.`;
    showToast(`Completed: ${task.title}. Customer notification queued.`);
    return;
  }

  showToast(`${task.title} moved to in progress.`);
}

function previewUpload(input, targetId) {
  const target = document.querySelector(targetId);
  const file = input.files && input.files[0];

  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    target.innerHTML = `<img src="${reader.result}" alt="${input.id.replace("Photo", "")} cleaning photo preview">`;
  };
  reader.readAsDataURL(file);
}

bookingDate.value = todayIso();
updateEstimate();
renderTasks();
renderDetail();

[serviceType, rooms, bookingDate, bookingTime, address].forEach((field) => {
  field.addEventListener("input", updateEstimate);
  field.addEventListener("change", updateEstimate);
});

document.querySelector("#booking-card").addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedOption = serviceType.selectedOptions[0].textContent;
  reservationNote.textContent = serviceType.value === "house-quote"
    ? "Quote request received. Admin review is pending."
    : "Reservation confirmed. Payment authorization is ready for processor connection.";
  showToast(`${selectedOption} reservation created.`);
});

document.querySelectorAll("[data-role]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-role]").forEach((roleButton) => roleButton.classList.remove("active"));
    button.classList.add("active");
    currentRole = button.dataset.role;
    activeRole.textContent = currentRole === "admin" ? "Admin" : "Cleaner";
    showToast(`${activeRole.textContent} workspace active.`);
  });
});

document.querySelector("#loginBtn").addEventListener("click", () => {
  showToast(`${currentRole === "admin" ? "Admin" : "Cleaner"} signed in.`);
});

document.querySelector("#addTaskBtn").addEventListener("click", () => {
  const nextTask = {
    id: Date.now(),
    title: "New reservation clean",
    customer: "Walk-in customer",
    cleaner: "Riley",
    window: "3:30 PM - 5:30 PM",
    address: "Pending address",
    status: "scheduled",
    price: 120
  };
  tasks.unshift(nextTask);
  selectedTaskId = nextTask.id;
  renderTasks();
  renderDetail();
  showToast("New task added to scheduled work.");
});

document.querySelector("#assignCleaner").addEventListener("change", (event) => {
  const task = selectedTask();
  task.cleaner = event.target.value;
  renderTasks();
  renderDetail();
  showToast(`${task.title} assigned to ${task.cleaner}.`);
});

document.querySelectorAll("[data-update]").forEach((button) => {
  button.addEventListener("click", () => updateTaskStatus(button.dataset.update));
});

document.querySelector("#beforePhoto").addEventListener("change", (event) => previewUpload(event.target, "#beforePreview"));
document.querySelector("#afterPhoto").addEventListener("change", (event) => previewUpload(event.target, "#afterPreview"));

document.querySelector("#locateBtn").addEventListener("click", () => {
  const status = document.querySelector("#locationStatus");

  if (!navigator.geolocation) {
    status.textContent = "Location services are unavailable in this browser.";
    return;
  }

  status.textContent = "Checking current location...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      status.textContent = `Current location saved: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}.`;
      showToast("Location updated for dispatch.");
    },
    () => {
      status.textContent = "Location permission was not granted.";
    }
  );
});

document.querySelector("#sendNoticeBtn").addEventListener("click", () => {
  const task = selectedTask();
  showToast(`Completion notice sent to ${task.customer}.`);
});

document.querySelector("#quoteBtn").addEventListener("click", () => {
  const sqft = document.querySelector("#sqft").value;
  showToast(`House quote request opened for ${Number(sqft).toLocaleString()} sq ft.`);
});
