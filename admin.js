import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.EPISTEME_CONFIG || {};
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);

const app = document.getElementById("app");
const logoutButton = document.getElementById("logoutBtn");

let session = null;
let profile = null;
let currentTab = "resources";
let subjects = [];
let managers = [];
let courses = [];
let resources = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(error) {
  console.error("Episteme admin error:", error);
  const message = error?.message || String(error || "Unknown error");
  app.innerHTML = `
    <div class="admin-card">
      <h2>后台暂时无法加载</h2>
      <p class="muted">后台页面已经打开，但数据加载失败。</p>
      <p class="danger" style="white-space:pre-wrap">${escapeHtml(message)}</p>
      <button class="mini" id="adminRetry">重新加载</button>
    </div>
  `;
  document.getElementById("adminRetry")?.addEventListener("click", () => location.reload());
}

async function getCurrentUser() {
  const result = await supabase.auth.getSession();
  if (result.error) throw result.error;
  if (!result.data.session) return null;

  session = result.data.session;

  const profileResult = await supabase
    .from("profiles")
    .select("id, username, role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileResult.error) throw profileResult.error;
  profile = profileResult.data;
  return profile;
}

async function loadData() {
  const [subjectsResult, managersResult, coursesResult, resourcesResult] = await Promise.all([
    supabase.from("subjects").select("id,name,code").order("name"),
    supabase.from("subject_managers").select("id,user_id,subject_id,created_at").order("created_at", { ascending: false }),
    supabase.from("courses").select("id,title,description,subject_id,course_type,status,created_at").order("created_at", { ascending: false }),
    supabase.from("library_items").select("id,name,description,subject_id,status,review_stage,is_hidden,file_size,mime_type,storage_path,created_at").eq("item_type", "file").order("created_at", { ascending: false })
  ]);

  if (subjectsResult.error) throw subjectsResult.error;
  if (managersResult.error) throw managersResult.error;
  if (coursesResult.error) throw coursesResult.error;
  if (resourcesResult.error) throw resourcesResult.error;

  subjects = subjectsResult.data || [];
  managers = managersResult.data || [];
  courses = coursesResult.data || [];
  resources = resourcesResult.data || [];

  if (profile.role === "subject_manager") {
    const managedSubjectIds = new Set(
      managers
        .filter((item) => item.user_id === profile.id)
        .map((item) => Number(item.subject_id))
    );

    subjects = subjects.filter((item) => managedSubjectIds.has(Number(item.id)));
    managers = managers.filter((item) => managedSubjectIds.has(Number(item.subject_id)));
    courses = courses.filter((item) => managedSubjectIds.has(Number(item.subject_id)));
    resources = resources.filter((item) => managedSubjectIds.has(Number(item.subject_id)));
  }
}

function subjectName(subjectId) {
  const subject = subjects.find((item) => Number(item.id) === Number(subjectId));
  return subject?.name || "未分类";
}

function resourceStatus(item) {
  if (item.status === "approved" && !item.is_hidden) return "已通过";
  if (item.review_stage === "rereview") return "重审";
  if (item.status === "rejected") return "已拒绝";
  return "待审核";
}

function layout() {
  const roleTitle = profile.role === "coordinator" ? "Coordinator 后台" : "Subject Manager 后台";

  app.innerHTML = `
    <div class="admin-top">
      <div>
        <div class="eyebrow">EPISTEME · ADMIN</div>
        <h1>${escapeHtml(roleTitle)}</h1>
        <p>管理资料、视频课、学科权限和运营信息。所有写操作都会经过系统权限验证。</p>
      </div>
      <span class="role-pill">${escapeHtml(profile.role)}</span>
    </div>

    <div class="admin-tabs">
      <button class="admin-tab" data-tab="resources">资料审核</button>
      <button class="admin-tab" data-tab="courses">视频课管理</button>
      <button class="admin-tab" data-tab="managers">Subject Manager</button>
      <button class="admin-tab" data-tab="subjects">学科管理</button>
    </div>

    <div id="adminView"></div>
  `;

  document.querySelectorAll(".admin-tab").forEach((button) => {
    button.addEventListener("click", () => {
      currentTab = button.dataset.tab;
      renderTab();
    });
  });

  renderTab();
}

function renderTab() {
  document.querySelectorAll(".admin-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === currentTab);
  });

  const view = document.getElementById("adminView");
  if (!view) return;

  if (currentTab === "resources") renderResources(view);
  if (currentTab === "courses") renderCourses(view);
  if (currentTab === "managers") renderManagers(view);
  if (currentTab === "subjects") renderSubjects(view);
}

function renderResources(view) {
  const pending = resources.filter((item) => resourceStatus(item) === "待审核");
  const rereview = resources.filter((item) => resourceStatus(item) === "重审");
  const approved = resources.filter((item) => resourceStatus(item) === "已通过");

  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><small>待审核</small><b>${pending.length}</b></div>
      <div class="stat"><small>重审</small><b>${rereview.length}</b></div>
      <div class="stat"><small>已通过</small><b>${approved.length}</b></div>
    </div>

    <div class="admin-card">
      <h2>资料审核队列</h2>
      <div class="section-note">资料先进入审核队列。审核通过后才会在网站资料库中公开。</div>
      ${renderResourceRows(resources)}
    </div>
  `;
}

function renderResourceRows(items) {
  if (!items.length) return '<div class="empty-admin">目前没有资料。</div>';

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>资料</th>
          <th>学科</th>
          <th>状态</th>
          <th>时间</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td><b>${escapeHtml(item.name)}</b><br><span class="muted">${escapeHtml(item.mime_type || "")}</span></td>
            <td>${escapeHtml(subjectName(item.subject_id))}</td>
            <td>${resourceStatus(item)}</td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCourses(view) {
  view.innerHTML = `
    <div class="admin-card">
      <h2>视频课管理</h2>
      <div class="section-note">视频课程目前通过课程记录和第三方视频地址管理。</div>
      ${courses.length ? `
        <table class="admin-table">
          <thead><tr><th>课程</th><th>学科</th><th>分类</th><th>状态</th></tr></thead>
          <tbody>
            ${courses.map((course) => `
              <tr>
                <td><b>${escapeHtml(course.title)}</b><br><span class="muted">${escapeHtml(course.description || "")}</span></td>
                <td>${escapeHtml(subjectName(course.subject_id))}</td>
                <td>${escapeHtml(course.course_type || "textbook")}</td>
                <td>${escapeHtml(course.status || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : '<div class="empty-admin">目前没有视频课。</div>'}
    </div>
  `;
}

function renderManagers(view) {
  view.innerHTML = `
    <div class="admin-grid">
      <div class="admin-card">
        <h2>Subject Managers</h2>
        <div class="section-note">这里显示当前账号有权限管理的学科负责人。</div>
        ${managers.length ? `
          <div class="manager-list">
            ${managers.map((manager) => `
              <div class="manager-row">
                <div>
                  <b>${escapeHtml(manager.user_id)}</b>
                  <small>${escapeHtml(subjectName(manager.subject_id))}</small>
                </div>
              </div>
            `).join("")}
          </div>
        ` : '<div class="empty-admin">目前没有 Subject Manager。</div>'}
      </div>
      <div class="admin-card">
        <h2>管理人权限</h2>
        <p class="muted">邀请码和权限调整功能会在核心后台稳定后重新接入。</p>
      </div>
    </div>
  `;
}

function renderSubjects(view) {
  view.innerHTML = `
    <div class="admin-card">
      <h2>学科管理</h2>
      <p class="muted">当前账号可以管理以下学科：</p>
      <div class="subject-list">
        ${subjects.length ? subjects.map((subject) => `
          <div class="subject-list-row" style="cursor:default">
            <span>
              <b>${escapeHtml(subject.name)}</b>
              <small>${escapeHtml(subject.code || "")}</small>
            </span>
            <span class="subject-arrow">→</span>
          </div>
        `).join("") : '<div class="empty-admin">暂无可管理学科。</div>'}
      </div>
    </div>
  `;
}

async function boot() {
  try {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("网站配置没有正确加载。");
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      location.href = "./#login";
      return;
    }

    if (!profile || !["coordinator", "subject_manager"].includes(profile.role)) {
      app.innerHTML = `
        <div class="admin-card">
          <h2>没有后台权限</h2>
          <p class="muted">只有 Coordinator 和 Subject Manager 可以进入这里。</p>
          <a class="outline" href="./">返回网站</a>
        </div>
      `;
      return;
    }

    await loadData();
    layout();
  } catch (error) {
    showError(error);
  }
}

logoutButton?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.href = "./";
});

window.__EpistemeAdmin = {
  reload: async () => {
    await loadData();
    layout();
  }
};

boot();
