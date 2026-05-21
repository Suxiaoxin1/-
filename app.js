/* ============================================================
   吉康公众号内容生成器 - 前端逻辑
   ============================================================ */

// ---- DOM refs ----
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const settingsToggle = $('#settingsToggle');
const settingsPanel  = $('#settingsPanel');
const apiBaseIpt     = $('#apiBase');
const apiKeyIpt      = $('#apiKey');
const generateBtn    = $('#generateBtn');
const clearBtn       = $('#clearBtn');
const copyBtn        = $('#copyBtn');
const downMdBtn      = $('#downMdBtn');
const loadingOverlay = $('#loadingOverlay');

const topicIpt       = $('#topicIpt');
const keywordsIpt    = $('#keywordsIpt');
const imgFileIpt     = $('#imgFileIpt');
const imgPreview     = $('#imgPreview');
const imgHint        = $('#imgHint');
const typeGroup      = $('#typeGroup');

const articleBody    = $('#articleBody');
const assessBody     = $('#assessBody');

const toastEl        = $('#toast');

let selectedImages = [];   // File objects
let articleMarkdown = '';
let assessMarkdown  = '';

// ---- Init ----
loadSettings();
bindEvents();

function loadSettings() {
  const base = localStorage.getItem('jikang_api_base');
  const key  = localStorage.getItem('jikang_api_key');
  if (base) apiBaseIpt.value = base;
  if (key)  apiKeyIpt.value  = key;
}

function saveSettings() {
  localStorage.setItem('jikang_api_base', apiBaseIpt.value.trim());
  localStorage.setItem('jikang_api_key',  apiKeyIpt.value.trim());
}

// ---- Event Bindings ----
function bindEvents() {
  // Settings
  settingsToggle.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
  apiBaseIpt.addEventListener('change', saveSettings);
  apiKeyIpt.addEventListener('change', saveSettings);

  // Validate inputs -> enable/disable generate button
  topicIpt.addEventListener('input', updateGenerateBtn);
  keywordsIpt.addEventListener('input', updateGenerateBtn);
  typeGroup.addEventListener('change', updateGenerateBtn);
  topicIpt.addEventListener('input', () => $('#topicCnt').textContent = topicIpt.value.length);
  keywordsIpt.addEventListener('input', () => $('#keywordsCnt').textContent = keywordsIpt.value.length);

  // Image upload
  imgFileIpt.addEventListener('change', handleImageSelect);
  $('#imgAddBtn').addEventListener('click', () => imgFileIpt.click());

  // Radio chips
  $$('.radio-chip input').forEach(r => {
    r.addEventListener('change', () => {
      $$('.radio-chip').forEach(l => l.classList.remove('active'));
      if (r.checked) r.closest('.radio-chip').classList.add('active');
    });
  });

  // Generate
  generateBtn.addEventListener('click', generate);

  // Clear
  clearBtn.addEventListener('click', clearAll);

  // Copy
  copyBtn.addEventListener('click', () => {
    if (!articleMarkdown) return;
    navigator.clipboard.writeText(articleMarkdown).then(() => showToast('✅ 已复制到剪贴板'));
  });

  // Download
  downMdBtn.addEventListener('click', () => {
    if (!articleMarkdown) return;
    downloadFile('吉康推文_' + formatDate() + '.md', articleMarkdown);
  });
}

// ---- Input Validation ----
function updateGenerateBtn() {
  const topic   = topicIpt.value.trim();
  const kw      = keywordsIpt.value.trim();
  const content = getSelectedType();
  const ok = topic.length > 0 && kw.length > 0 && content !== null;
  generateBtn.disabled = !ok;
}

function getSelectedType() {
  const el = document.querySelector('input[name="content"]:checked');
  return el ? el.value : null;
}

// ---- Image Handling ----
function handleImageSelect(e) {
  const files = Array.from(e.target.files);
  const remaining = 5 - selectedImages.length;
  const toAdd = files.slice(0, remaining);
  selectedImages.push(...toAdd);
  renderImagePreviews();
  updateGenerateBtn();
  e.target.value = '';
}

function removeImage(index) {
  selectedImages.splice(index, 1);
  renderImagePreviews();
  updateGenerateBtn();
}

function renderImagePreviews() {
  imgPreview.innerHTML = '';
  selectedImages.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const wrap = document.createElement('div');
    wrap.className = 'img-thumb-wrap';
    wrap.innerHTML =
      `<img class="img-thumb" src="${url}" alt="${file.name}">` +
      `<button class="img-thumb-del" data-idx="${i}">✕</button>`;
    imgPreview.appendChild(wrap);
  });
  if (selectedImages.length < 5) {
    const btn = document.createElement('label');
    btn.className = 'img-add-btn';
    btn.innerHTML = '<span>+</span><span>添加</span>';
    btn.addEventListener('click', () => imgFileIpt.click());
    imgPreview.appendChild(btn);
  }
  imgHint.innerHTML = `已选 <b>${selectedImages.length}</b>/5 张`;
  // Bind delete
  $$('.img-thumb-del').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); removeImage(+b.dataset.idx); });
  });
}

// ---- Generate ----
async function generate() {
  const topic   = topicIpt.value.trim();
  const kw      = keywordsIpt.value.trim();
  const content = getSelectedType();
  if (!topic || !kw || !content) return;

  const apiBase = apiBaseIpt.value.trim();
  const apiKey  = apiKeyIpt.value.trim();

  // Show loading
  loadingOverlay.classList.remove('hidden');
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ 生成中…';

  try {
    // Step 1: Upload images (if any)
    let imageFiles = [];
    if (selectedImages.length > 0) {
      imageFiles = await uploadImages(apiBase, apiKey);
    }

    // Step 2: Call workflow
    const payload = {
      inputs: {
        topic: topic,
        key_words: kw,
        content: content,
        images: imageFiles,
      },
      response_mode: 'blocking',
      user: 'web-user',
    };

    const res = await callWorkflow(apiBase, apiKey, payload);
    if (!res || !res.data || !res.data.outputs) {
      throw new Error('工作流返回数据异常');
    }

    const outputs = res.data.outputs;
    articleMarkdown = outputs.result || '';
    assessMarkdown  = outputs.text   || '';

    // Render
    renderArticle(articleMarkdown);
    renderAssessment(assessMarkdown);

    // Enable copy & download
    copyBtn.disabled = false;
    downMdBtn.disabled = false;

    showToast('✅ 文案生成成功');
  } catch (err) {
    showToast('❌ 生成失败: ' + (err.message || '未知错误'));
    articleBody.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><p>生成失败</p><span>${escapeHtml(err.message)}</span></div>`;
    assessBody.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>暂无评估</p></div>`;
  } finally {
    loadingOverlay.classList.add('hidden');
    generateBtn.disabled = false;
    generateBtn.textContent = '🚀 生成文案';
    updateGenerateBtn();
  }
}

// ---- Image Upload ----
async function uploadImages(apiBase, apiKey) {
  const uploadPromises = selectedImages.map(file => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('user', 'web-user');

    const url = stripTrailing(apiBase) + '/v1/files/upload';
    const headers = {};
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: formData,
    }).then(r => r.json()).then(data => {
      if (data && data.id) return data.id;
      throw new Error('图片上传失败: ' + (data?.message || '无返回ID'));
    });
  });

  const fileIds = await Promise.all(uploadPromises);

  return fileIds.map(id => ({
    transfer_method: 'local_file',
    upload_file_id: id,
    type: 'image',
  }));
}

// ---- Workflow API Call ----
async function callWorkflow(apiBase, apiKey, payload) {
  const url = stripTrailing(apiBase) + '/v1/workflows/run';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

  const r = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const errBody = await r.text();
    let msg;
    try { msg = JSON.parse(errBody).message || errBody; } catch { msg = errBody; }
    throw new Error(`API ${r.status}: ${msg}`);
  }

  return r.json();
}

// ---- Markdown Renderer (lightweight) ----
function renderMarkdown(md) {
  if (!md) return '';

  let html = md
    // Escape HTML first (for non-markdown content)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Code blocks (must be before inline code)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang}">${code.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}</code></pre>`
    )

    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')

    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')

    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

    // Bold & Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')

    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')

    // HR
    .replace(/^---$/gm, '<hr>')

    // Blockquote
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

    // Unordered list
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

    // Ordered list
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

    // Br
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

    // Tables (simple: pipe-based)
    .replace(/^\|(.+)\|[\s\S]*?\n/gm, (match) => {
      const rows = match.trim().split('\n').filter(r => !r.includes('---'));
      const cells = rows.map(r => r.split('|').filter(c => c.trim()));
      if (cells.length < 2) return match;
      const header = cells[0].map(c => `<th>${c.trim()}</th>`).join('');
      const body = cells.slice(1).map(r => `<tr>${r.map(c => `<td>${c.trim()}</td>`).join('')}</tr>`).join('');
      return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
    })

    // Cleanup
    .replace(/<\/?br>/g, '<br>')

    ;

  // Wrap in p if not already a block element
  if (!html.startsWith('<h') && !html.startsWith('<table') && !html.startsWith('<ul') && !html.startsWith('<blockquote') && !html.startsWith('<pre') && !html.startsWith('<img') && !html.startsWith('<hr')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

// ---- Render Article ----
function renderArticle(md) {
  const html = renderMarkdown(md);
  articleBody.innerHTML = `<div class="article-content">${html}</div>`;
}

// ---- Render Assessment ----
function renderAssessment(md) {
  const html = renderMarkdown(md);
  assessBody.innerHTML = `<div class="article-content">${html}</div>`;

  // Add score bar visual
  const scoreMatch = md.match(/(\d+)\/30/);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1]);
    const pct = (score / 30) * 100;
    const cls = score >= 24 ? 'high' : score >= 18 ? 'mid' : 'low';
    const badge = document.createElement('div');
    badge.className = `total-score ${score >= 24 ? 'pass' : score >= 18 ? 'warn' : 'fail'}`;
    badge.textContent = `综合评分：${score}/30`;
    assessBody.insertBefore(badge, assessBody.firstChild);
  }
}

// ---- Clear ----
function clearAll() {
  topicIpt.value = '';
  keywordsIpt.value = '';
  $$('input[name="content"]').forEach(r => r.checked = false);
  $$('.radio-chip').forEach(l => l.classList.remove('active'));
  selectedImages = [];
  renderImagePreviews();
  articleMarkdown = '';
  assessMarkdown  = '';
  articleBody.innerHTML = `<div class="empty"><div class="empty-icon">✍️</div><p>输入参数后点击「生成文案」</p><span>AI 将自动生成公众号推文并在此渲染</span></div>`;
  assessBody.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>生成文案后自动出评估报告</p><span>30分制 | 6维度分析 | 改进建议</span></div>`;
  copyBtn.disabled = true;
  downMdBtn.disabled = true;
  updateGenerateBtn();
  $('#topicCnt').textContent = '0';
  $('#keywordsCnt').textContent = '0';
}

// ---- Utilities ----
function stripTrailing(s) {
  return s.replace(/\/+$/, '');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

function downloadFile(name, content) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add('hidden'), 2500);
}
