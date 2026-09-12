const app = document.querySelector('#app');
let categories = [];
let places = [];
let selectedCategory = '';

const api = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error('No pudimos cargar la información.');
  return response.json();
};
const esc = (text) => String(text).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]);
const card = (place) => `<button class="card" data-place="${place.id}">
  <img src="${place.imageUrl}" alt="${esc(place.name)}" />
  <span class="card-body"><span class="meta"><span>${place.distanceKm} km</span><span class="rating">★ ${place.rating} (${place.reviewCount})</span></span><h3>${esc(place.name)}</h3><p>${esc(place.description)}</p><span class="tags">${place.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</span></span>
</button>`;

function home() {
  app.innerHTML = `<div class="shell"><header class="topbar"><div class="brand">BCA<small>Barrancabermeja City App</small></div><button class="profile" aria-label="Mi perfil">♡</button></header>
  <section class="hero"><div class="hero-content"><div class="eyebrow">Guía turística oficial</div><h1>La bella hija del sol</h1><p>Descubre sabores, paisajes y experiencias únicas en Barrancabermeja.</p><button class="primary" id="explore">Explorar la ciudad →</button></div></section>
  <section class="section" id="discover"><div class="section-head"><div><h2>¿Qué quieres explorar?</h2><p>Encuentra tu próximo plan en la ciudad.</p></div></div><label class="search">⌕ <input id="search" type="search" placeholder="Buscar lugares, actividades..." /></label>
  <div class="categories" id="categories"></div></section>
  <section class="section"><div class="section-head"><div><h2 id="place-title">Lugares para ti</h2><p id="place-subtitle">Experiencias seleccionadas en Barrancabermeja.</p></div></div><div class="place-grid" id="places"></div></section></div>`;
  document.querySelector('#explore').onclick = () => document.querySelector('#discover').scrollIntoView({ behavior: 'smooth' });
  document.querySelector('#search').oninput = (event) => renderPlaces(event.target.value);
  renderCategories(); renderPlaces();
}
function renderCategories() {
  document.querySelector('#categories').innerHTML = categories.map((category) => `<button class="category ${selectedCategory === category.id ? 'active':''}" data-category="${category.id}"><span>${category.icon}</span><b>${esc(category.name)}</b><small>${esc(category.description)}</small></button>`).join('');
  document.querySelectorAll('[data-category]').forEach((button) => button.onclick = () => { selectedCategory = selectedCategory === button.dataset.category ? '' : button.dataset.category; renderCategories(); renderPlaces(document.querySelector('#search').value); });
}
function renderPlaces(query = '') {
  const normalized = query.toLowerCase();
  const visible = places.filter((place) => (!selectedCategory || place.categoryId === selectedCategory) && `${place.name} ${place.description} ${place.tags.join(' ')}`.toLowerCase().includes(normalized));
  const current = categories.find((category) => category.id === selectedCategory);
  document.querySelector('#place-title').textContent = current ? current.name : 'Lugares para ti';
  document.querySelector('#place-subtitle').textContent = `${visible.length} ${visible.length === 1 ? 'lugar encontrado' : 'lugares encontrados'}`;
  document.querySelector('#places').innerHTML = visible.length ? visible.map(card).join('') : '<div class="empty">Aún estamos agregando lugares para esta categoría. Prueba con Restaurantes o realiza otra búsqueda.</div>';
  document.querySelectorAll('[data-place]').forEach((button) => button.onclick = () => detail(button.dataset.place));
}
async function detail(placeId) {
  const { data: place } = await api(`/places/${placeId}`);
  app.innerHTML = `<div class="shell detail"><button class="back" id="back">← Volver a explorar</button><img class="detail-img" src="${place.imageUrl}" alt="${esc(place.name)}" /><div class="detail-grid"><article><div class="eyebrow" style="color:#1c6b57">${categories.find((c) => c.id === place.categoryId)?.icon || ''} ${categories.find((c) => c.id === place.categoryId)?.name || ''}</div><h1>${esc(place.name)}</h1><p class="rating">★ ${place.rating} · ${place.reviewCount} reseñas</p><p>📍 ${esc(place.address)} · ${place.distanceKm} km</p><h2>Sobre este lugar</h2><p style="line-height:1.65;color:#52605a">${esc(place.description)}</p><div class="tags">${place.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div><div class="actions"><a class="action" href="https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}" target="_blank" rel="noreferrer">🗺️ Cómo llegar</a><a class="action outline" href="tel:${place.phone.replace(/\s/g,'')}">📞 Contactar</a></div></article><aside class="info-card"><p><b>Horario</b><br>🕐 ${esc(place.schedule)}</p><p><b>Precio</b><br>💰 ${esc(place.priceRange)}</p><p><b>Distancia</b><br>${place.distanceKm} km de ti</p></aside></div></div>`;
  document.querySelector('#back').onclick = home;
}
(async () => { try { [{ data: categories }, { data: places }] = await Promise.all([api('/categories'), api('/places')]); home(); } catch (error) { app.innerHTML = `<div class="shell"><h1>Algo no salió bien</h1><p>${error.message}</p></div>`; } })();
