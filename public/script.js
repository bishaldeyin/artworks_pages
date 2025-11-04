async function loadGalleryPublic() {
  const res = await fetch('/api/artworks');
  const data = await res.json();
  if (!data.success) return;

  const gallery = document.getElementById('gallery');
  gallery.innerHTML = data.artworks.map(a => `
    <div class="card" data-id="${a._id}">
      <img src="/uploads/${a.filename}" alt="${escapeHTML(a.title)}" />
      <div class="content">
        <h3>${escapeHTML(a.title)}</h3>
        <p>${escapeHTML(a.description)}</p>
      </div>
      <div class="action-bar">
        <button class="action-btn" onclick="likePost('${a._id}')">❤️ Like (${a.likes})</button>
        <button class="action-btn" onclick="toggleComments('${a._id}')">💬 Comments (${a.comments.length})</button>
      </div>
      <div class="comments-section" id="comments-${a._id}">
        <div class="comment-list">
          ${a.comments.map(c => `
            <div class="comment">
              <strong>${escapeHTML(c.email)}</strong>
              <p>${escapeHTML(c.text)}</p>
            </div>
          `).join('')}
        </div>
        <form class="comment-form" onsubmit="submitComment(event, '${a._id}')">
          <input name="email" type="email" placeholder="Your email" required />
          <input name="text" placeholder="Write a comment..." required />
          <button type="submit">Post</button>
        </form>
      </div>
    </div>
  `).join('');
}

async function likePost(id) {
  const res = await fetch(`/api/like/${id}`, { method: 'POST' });
  const j = await res.json();
  if (j.success) loadGalleryPublic();
}

function toggleComments(id) {
  const section = document.getElementById(`comments-${id}`);
  section.style.display = section.style.display === 'block' ? 'none' : 'block';
}

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

async function submitComment(e, id) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const body = { email: fd.get('email'), text: fd.get('text') };
  const res = await fetch('/api/comment/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json();
  if (j.success) {
    form.reset();
    loadGalleryPublic();
  } else {
    alert(j.message || 'Failed to post comment');
  }
}

loadGalleryPublic();
