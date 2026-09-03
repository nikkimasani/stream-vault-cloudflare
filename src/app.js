import './style.css'

const PUBLIC_COLLECTIONS = {
  free: { label: 'Free TV collection', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8' },
  world: { label: 'All public channels', url: 'https://iptv-org.github.io/iptv/index.m3u' },
  us: { label: 'United States', url: 'https://iptv-org.github.io/iptv/countries/us.m3u' },
  cn: { label: 'China', url: 'https://iptv-org.github.io/iptv/countries/cn.m3u' },
  hk: { label: 'Hong Kong', url: 'https://iptv-org.github.io/iptv/countries/hk.m3u' },
  tw: { label: 'Taiwan', url: 'https://iptv-org.github.io/iptv/countries/tw.m3u' },
  jp: { label: 'Japan', url: 'https://iptv-org.github.io/iptv/countries/jp.m3u' },
  kr: { label: 'South Korea', url: 'https://iptv-org.github.io/iptv/countries/kr.m3u' },
  news: { label: 'News', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  sports: { label: 'Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  entertainment: { label: 'Entertainment', url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  movies: { label: 'Movie channels', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  kids: { label: 'Kids', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  music: { label: 'Music', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' }
}
const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
const safeUrl = (value = '') => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : '' } catch { return '' } }
const readJson = (store, key, fallback) => { try { return JSON.parse(store.getItem(key)) ?? fallback } catch { return fallback } }

const state = {
  view: 'home', source: 'public', sourceLabel: 'All public channels', publicCollection: 'world', xtream: null,
  live: [], movies: [], series: [], categories: { live: {}, movies: {}, series: {} },
  visible: 60, current: null, hls: null
}

function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36) }
function parseAttributes(line) { const out = {}; for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2]; return out }
function parseM3U(text) {
  const rows = []; let info = null
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('#EXTINF:')) {
      const a = parseAttributes(line); const name = (line.slice(line.lastIndexOf(',') + 1) || a['tvg-name'] || 'Untitled').trim()
      info = { name, logo: a['tvg-logo'] || '', category: a['group-title'] || 'Live TV', guideId: a['tvg-id'] || '', type: 'live' }
    } else if (info && /^https?:\/\//i.test(line)) { rows.push({ ...info, id: `m3u-${hash(`${info.name}|${line}`)}`, url: line }); info = null }
  }
  return rows.filter((x, i, all) => all.findIndex(y => y.url === x.url) === i)
}

function categoryMap(rows = []) { return Object.fromEntries(rows.map(x => [String(x.category_id), x.category_name || 'Other'])) }
function apiUrl(action, extra = {}) {
  const { server, username, password } = state.xtream
  const url = new URL(`${server}/player_api.php`)
  url.search = new URLSearchParams({ username, password, action, ...extra })
  return url
}
async function getJson(url) { const r = await fetch(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`Provider returned ${r.status}`); return r.json() }

function liveUrl(row) {
  if (row.url) return row.url
  const x = state.xtream; return `${x.server}/live/${encodeURIComponent(x.username)}/${encodeURIComponent(x.password)}/${row.stream_id}.m3u8`
}
function movieUrl(row) {
  const x = state.xtream; const ext = /^[a-z0-9]{2,5}$/i.test(row.container_extension || '') ? row.container_extension : 'mp4'
  return `${x.server}/movie/${encodeURIComponent(x.username)}/${encodeURIComponent(x.password)}/${row.stream_id}.${ext}`
}
function episodeUrl(row) {
  const x = state.xtream; const ext = /^[a-z0-9]{2,5}$/i.test(row.container_extension || '') ? row.container_extension : 'mp4'
  return `${x.server}/series/${encodeURIComponent(x.username)}/${encodeURIComponent(x.password)}/${row.id}.${ext}`
}

async function loadPublic(key = state.publicCollection) {
  const collection = PUBLIC_COLLECTIONS[key] || PUBLIC_COLLECTIONS.world
  state.publicCollection = PUBLIC_COLLECTIONS[key] ? key : 'world'
  localStorage.setItem('stream-vault-public-collection', state.publicCollection)
  $('#publicCollection').value = state.publicCollection
  setLiveStatus(`Loading ${collection.label.toLowerCase()}…`)
  try {
    const response = await fetch(collection.url)
    if (!response.ok) throw new Error()
    state.live = parseM3U(await response.text())
    state.categories.live = Object.fromEntries([...new Set(state.live.map(x => x.category))].sort().map(x => [x, x]))
    state.source = 'public'; state.sourceLabel = collection.label; state.movies = []; state.series = []; state.visible = 60
    renderAll()
  } catch { setLiveStatus('The public directory could not be reached. Try again in a normal browser or add your own authorized playlist.') }
}

async function connectXtream(credentials, remember) {
  const server = credentials.server.trim().replace(/\/+$/, '')
  if (!safeUrl(server)) throw new Error('Enter a complete HTTP or HTTPS provider URL.')
  if (location.protocol === 'https:' && server.startsWith('http:')) throw new Error('This provider uses HTTP. Browsers block HTTP video inside a secure HTTPS app. Ask the provider for an HTTPS address.')
  state.xtream = { server, username: credentials.username.trim(), password: credentials.password }
  const authUrl = new URL(`${server}/player_api.php`)
  authUrl.search = new URLSearchParams({ username: state.xtream.username, password: state.xtream.password })
  const auth = await getJson(authUrl)
  if (String(auth?.user_info?.auth) !== '1') throw new Error(auth?.user_info?.message || 'The provider rejected these credentials.')
  const [liveCats, movieCats, seriesCats, live, movies, series] = await Promise.all([
    getJson(apiUrl('get_live_categories')), getJson(apiUrl('get_vod_categories')), getJson(apiUrl('get_series_categories')),
    getJson(apiUrl('get_live_streams')), getJson(apiUrl('get_vod_streams')), getJson(apiUrl('get_series'))
  ])
  state.categories = { live: categoryMap(liveCats), movies: categoryMap(movieCats), series: categoryMap(seriesCats) }
  state.live = Array.isArray(live) ? live.map(x => ({ ...x, id:`live-${x.stream_id}`, name:x.name || 'Live channel', logo:x.stream_icon || '', category:state.categories.live[String(x.category_id)] || 'Live TV', type:'live' })) : []
  state.movies = Array.isArray(movies) ? movies.map(x => ({ ...x, id:`movie-${x.stream_id}`, name:x.name || 'Movie', poster:x.stream_icon || '', category:state.categories.movies[String(x.category_id)] || 'Movies', type:'movie' })) : []
  state.series = Array.isArray(series) ? series.map(x => ({ ...x, id:`series-${x.series_id}`, name:x.name || 'Series', poster:x.cover || '', category:state.categories.series[String(x.category_id)] || 'Series', type:'series' })) : []
  state.source = 'xtream'; state.sourceLabel = auth?.server_info?.url ? `Xtream · ${new URL(server).hostname}` : 'Xtream Codes'
  const storage = remember ? localStorage : sessionStorage
  storage.setItem('stream-vault-xtream', JSON.stringify(state.xtream))
  if (!remember) localStorage.removeItem('stream-vault-xtream')
  renderAll()
}

function initials(name = 'TV') { return name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() }
function image(url, alt = '') { const safe = safeUrl(url); return safe ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer">` : '' }
function channelCard(row) { return `<button class="channel-card" data-play="${escapeHtml(row.id)}"><span class="channel-logo">${image(row.logo)}<i>${escapeHtml(initials(row.name))}</i></span><span class="channel-info"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.category || 'Live TV')}</span></span></button>` }
function mediaCard(row) { return `<button class="media-card" data-detail="${escapeHtml(row.id)}"><span class="poster">${image(row.poster, row.name)}<i>◇</i></span><span class="media-copy"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.category || row.type)}</span></span></button>` }

function populateSelect(id, categories) {
  const select = $(id); const value = select.value
  select.innerHTML = '<option value="all">All categories</option>' + Object.entries(categories).sort((a,b)=>a[1].localeCompare(b[1])).map(([key,label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('')
  if ([...select.options].some(o => o.value === value)) select.value = value
}
function filtered(kind) {
  const term = $(`#${kind === 'live' ? 'live' : kind.slice(0,-1)}Search`).value.trim().toLowerCase()
  const select = $(`#${kind === 'live' ? 'live' : kind.slice(0,-1)}Category`).value
  return state[kind].filter(x => (!term || `${x.name} ${x.category}`.toLowerCase().includes(term)) && (select === 'all' || String(x.category_id ?? x.category) === select))
}
function setLiveStatus(message = '') { $('#liveStatus').textContent = message; $('#liveStatus').hidden = !message }
function renderLive() {
  populateSelect('#liveCategory', state.categories.live); const rows = filtered('live'); const shown = rows.slice(0,state.visible)
  $('#liveGrid').innerHTML = shown.map(channelCard).join(''); $('#liveCount').textContent = `${rows.length.toLocaleString()} channels`
  $('#loadMore').hidden = shown.length >= rows.length
  setLiveStatus(rows.length ? '' : 'No channels match this view.')
  $('#homeLiveRail').innerHTML = state.live.slice(0,12).map(channelCard).join('')
}
function renderMedia(kind) {
  const singular = kind.slice(0,-1); populateSelect(`#${singular}Category`, state.categories[kind]); const rows = filtered(kind)
  const hasLibrary = state.source === 'xtream' || (state.source === 'm3u' && kind === 'movies')
  $(`#${singular}Grid`).innerHTML = rows.map(mediaCard).join(''); $(`#${singular}Count`).textContent = hasLibrary ? `${rows.length.toLocaleString()} titles` : `Connect Xtream Codes to load ${kind}`
  $(`#${singular}Empty`).hidden = hasLibrary && rows.length > 0
  $(`#home${singular[0].toUpperCase()+singular.slice(1)}Rail`).innerHTML = state[kind].slice(0,12).map(mediaCard).join('')
}
function renderRecents() {
  const rows = readJson(localStorage, 'stream-vault-recents', []).filter(x => safeUrl(x.url)).slice(0,10)
  $('#continueSection').hidden = !rows.length
  $('#continueRail').innerHTML = rows.map(x => `<button class="resume-card" data-resume="${escapeHtml(x.id)}"><span class="channel-logo">${image(x.logo || x.poster)}<i>▶</i></span><span class="channel-info"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.type === 'live' ? 'Live TV' : 'Continue watching')}</span></span></button>`).join('')
}
function renderSource() {
  $('#sourceName').textContent = state.source === 'xtream' ? 'Xtream connected' : state.sourceLabel
  $('#heroSource').textContent = state.sourceLabel; $('#sourceDot').classList.toggle('connected', state.source !== 'public')
  $$('.xtream-only').forEach(x => x.hidden = state.source !== 'xtream'); $('#disconnectButton').hidden = state.source === 'public'
  $('#publicCollection').disabled = state.source !== 'public'
}
function renderAll() { renderSource(); renderLive(); renderMedia('movies'); renderMedia('series'); renderRecents() }

function navigate(view) {
  state.view = view; $$('.view').forEach(x => x.classList.toggle('active', x.id === `${view}View`)); $$('.nav-action').forEach(x => x.classList.toggle('active', x.dataset.view === view)); window.scrollTo({top:0,behavior:'smooth'})
}
function findItem(id) { return [...state.live,...state.movies,...state.series].find(x => x.id === id) }
function saveRecent(item) {
  const url = item.url || (item.type === 'live' ? liveUrl(item) : item.type === 'movie' ? movieUrl(item) : '')
  const record = { id:item.id, name:item.name, logo:item.logo || '', poster:item.poster || '', type:item.type, url, meta:item.category || '' }
  const old = readJson(localStorage,'stream-vault-recents',[]); localStorage.setItem('stream-vault-recents',JSON.stringify([record,...old.filter(x=>x.id!==record.id)].slice(0,20)))
}
function stopPlayer() { if (state.hls) state.hls.destroy(); state.hls = null; const video=$('#video'); video.pause(); video.removeAttribute('src'); video.load() }
function favoriteIds() { return new Set(readJson(localStorage,'stream-vault-favorites',[])) }
function updateFavoriteButton() { const saved=state.current&&favoriteIds().has(state.current.id); $('#favoriteButton').textContent=saved?'♥':'♡'; $('#favoriteButton').style.color=saved?'var(--mint)':'' }
function play(item) {
  if (!item) return
  const url = item.url || (item.type === 'live' ? liveUrl(item) : movieUrl(item)); if (!safeUrl(url)) return
  stopPlayer(); state.current = { ...item, url }; saveRecent(state.current); renderRecents()
  $('#playerTitle').textContent=item.name; $('#playerMeta').textContent=item.meta || item.category || ''; $('#playerType').textContent=item.type==='live'?'LIVE':item.type==='episode'?'EPISODE':'MOVIE'; $('#openStream').href=url; $('#videoMessage').hidden=true; updateFavoriteButton()
  const video=$('#video')
  if (window.Hls?.isSupported() && /\.m3u8?(?:$|\?)/i.test(url)) { state.hls=new window.Hls({enableWorker:true,lowLatencyMode:true,manifestLoadingMaxRetry:3,fragLoadingMaxRetry:4}); state.hls.loadSource(url); state.hls.attachMedia(video); state.hls.on(window.Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>{})); state.hls.on(window.Hls.Events.ERROR,(_e,d)=>{ if(d.fatal){ $('#videoMessage').textContent='This stream could not play. It may be offline, region restricted, blocked by CORS, or require a codec this browser does not support.'; $('#videoMessage').hidden=false } }) } else { video.src=url; video.play().catch(()=>{}) }
  if (!$('#playerDialog').open) $('#playerDialog').showModal()
}

async function openDetail(item) {
  if (!item) return
  const poster=safeUrl(item.poster); let body=`<div class="detail-layout">${poster?`<img class="detail-poster" src="${escapeHtml(poster)}" alt="">`:'<div class="detail-poster"></div>'}<div class="detail-copy"><span class="eyebrow">${escapeHtml(item.category || item.type)}</span><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.plot || item.info?.plot || 'Available from your connected provider.')}</p>`
  if (item.type === 'movie') body += `<button class="primary" data-play="${escapeHtml(item.id)}">▶ Play movie</button>`
  if (item.type === 'series') {
    body += '<div class="episode-list"><span class="eyebrow">Episodes</span><p>Loading episodes…</p></div>'
  }
  $('#detailContent').innerHTML = `${body}</div></div>`; if (!$('#detailDialog').open) $('#detailDialog').showModal()
  if (item.type === 'series') {
    try {
      const data=await getJson(apiUrl('get_series_info',{series_id:item.series_id})); const episodes=Object.entries(data.episodes || {}).flatMap(([season,rows]) => (rows||[]).map(x=>({ ...x, season, name:x.title || `Episode ${x.episode_num || ''}`, type:'episode', url:episodeUrl(x), meta:`Season ${season} · Episode ${x.episode_num || ''}`})))
      $('.episode-list').innerHTML='<span class="eyebrow">Episodes</span>'+episodes.map((x,i)=>`<button class="episode" data-episode="${i}"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.meta)}</span></button>`).join('')
      $$('.episode').forEach((button,i)=>button.addEventListener('click',()=>{ $('#detailDialog').close(); play(episodes[i]) }))
    } catch { $('.episode-list').innerHTML='<p>Episodes could not be loaded. The provider may block browser requests.</p>' }
  }
}

function openSource(tab='xtream') { $$('.source-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab)); $$('.source-panel').forEach(x=>x.classList.toggle('active',x.dataset.panel===tab)); $('#sourceStatus').hidden=true; if(!$('#sourceDialog').open) $('#sourceDialog').showModal() }
function disconnect() { localStorage.removeItem('stream-vault-xtream'); sessionStorage.removeItem('stream-vault-xtream'); state.xtream=null; $('#sourceDialog').close(); loadPublic(state.publicCollection) }

async function cast() {
  const video=$('#video')
  try {
    if (window.cast?.framework && state.current) { const ctx=window.cast.framework.CastContext.getInstance(); let session=ctx.getCurrentSession(); if(!session){await ctx.requestSession();session=ctx.getCurrentSession()} const info=new chrome.cast.media.MediaInfo(state.current.url,/\.m3u8/i.test(state.current.url)?'application/x-mpegURL':'video/mp4'); info.metadata=new chrome.cast.media.GenericMediaMetadata(); info.metadata.title=state.current.name; await session.loadMedia(new chrome.cast.media.LoadRequest(info)); return }
    if (typeof video.webkitShowPlaybackTargetPicker==='function') return video.webkitShowPlaybackTargetPicker()
    if (video.remote?.prompt) return await video.remote.prompt()
    throw new Error()
  } catch { $('#videoMessage').textContent='Casting is unavailable here. Use Safari for AirPlay or Chrome on Android or desktop for Chromecast, with both devices on the same network.'; $('#videoMessage').hidden=false }
}
function initCast() { window.__onGCastApiAvailable=(ok)=>{if(ok&&window.cast?.framework)window.cast.framework.CastContext.getInstance().setOptions({receiverApplicationId:chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,autoJoinPolicy:chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED})}; const s=document.createElement('script');s.src='https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';s.async=true;document.head.appendChild(s) }

document.addEventListener('click', event => {
  const nav=event.target.closest('[data-view]'); if(nav) navigate(nav.dataset.view)
  const playButton=event.target.closest('[data-play]'); if(playButton){const item=findItem(playButton.dataset.play); if(item) play(item)}
  const detail=event.target.closest('[data-detail]'); if(detail) openDetail(findItem(detail.dataset.detail))
  const resume=event.target.closest('[data-resume]'); if(resume){const item=readJson(localStorage,'stream-vault-recents',[]).find(x=>x.id===resume.dataset.resume);if(item)play(item)}
  const close=event.target.closest('[data-close]'); if(close){if(close.dataset.close==='playerDialog')stopPlayer(); $(`#${close.dataset.close}`).close()}
  if(event.target.closest('.open-source'))openSource('xtream')
})
$('#sourceButton').addEventListener('click',()=>openSource()); $('#heroConnect').addEventListener('click',()=>openSource()); $('#changeSource').addEventListener('click',()=>openSource())
$('#searchToggle').addEventListener('click',()=>{navigate('live');$('#liveSearch').focus()})
$$('.source-tab').forEach(x=>x.addEventListener('click',()=>openSource(x.dataset.tab)))
$('#disconnectButton').addEventListener('click',disconnect)
$('#publicCollection').addEventListener('change',event=>loadPublic(event.target.value))
$('#xtreamForm').addEventListener('submit',async event=>{event.preventDefault();const button=$('#xtreamSubmit');button.disabled=true;button.textContent='Connecting…';$('#sourceStatus').hidden=true;try{await connectXtream({server:$('#xtreamServer').value,username:$('#xtreamUsername').value,password:$('#xtreamPassword').value},$('#rememberXtream').checked);$('#sourceDialog').close();navigate('home')}catch(error){state.xtream=null;$('#sourceStatus').textContent=`${error.message || 'Could not connect.'} If the login works in another app, the provider may be blocking browser CORS requests.`;$('#sourceStatus').hidden=false}finally{button.disabled=false;button.textContent='Connect'}})
$('#m3uForm').addEventListener('submit',async event=>{event.preventDefault();try{let text='';const file=$('#m3uFile').files?.[0];if(file)text=await file.text();else{const url=$('#m3uUrl').value.trim();if(!safeUrl(url))throw new Error('Choose a file or enter a complete playlist URL.');const response=await fetch(url);if(!response.ok)throw new Error(`Playlist returned ${response.status}.`);text=await response.text()}const rows=parseM3U(text);if(!rows.length)throw new Error('No playable HTTP streams were found.');const importType=$('#m3uType').value;state.source='m3u';state.sourceLabel=$('#m3uName').value.trim()||file?.name||'My M3U playlist';state.xtream=null;if(importType==='movies'){state.live=[];state.movies=rows.map(row=>({...row,id:`movie-${row.id}`,poster:row.logo,type:'movie'}));state.series=[];state.categories={live:{},movies:Object.fromEntries([...new Set(state.movies.map(x=>x.category))].map(x=>[x,x])),series:{}}}else{state.live=rows;state.categories={live:Object.fromEntries([...new Set(rows.map(x=>x.category))].map(x=>[x,x])),movies:{},series:{}};state.movies=[];state.series=[]}renderAll();$('#sourceDialog').close();navigate(importType==='movies'?'movies':'live')}catch(error){$('#sourceStatus').textContent=`${error.message} A remote playlist must allow browser CORS access.`;$('#sourceStatus').hidden=false}})
for(const kind of ['live','movie','series']){$(`#${kind}Search`).addEventListener('input',()=>kind==='live'?renderLive():renderMedia(`${kind}s`));$(`#${kind}Category`).addEventListener('change',()=>kind==='live'?renderLive():renderMedia(`${kind}s`))}
$('#loadMore').addEventListener('click',()=>{state.visible+=60;renderLive()})
$('#castButton').addEventListener('click',cast)
$('#favoriteButton').addEventListener('click',()=>{if(!state.current)return;const ids=favoriteIds();ids.has(state.current.id)?ids.delete(state.current.id):ids.add(state.current.id);localStorage.setItem('stream-vault-favorites',JSON.stringify([...ids]));updateFavoriteButton()})
$('#pipButton').addEventListener('click',async()=>{const v=$('#video');try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else if(document.pictureInPictureEnabled)await v.requestPictureInPicture();else if(v.webkitSupportsPresentationMode)v.webkitSetPresentationMode('picture-in-picture')}catch{}})
$('#playerDialog').addEventListener('close',stopPlayer)

initCast()
const saved=readJson(sessionStorage,'stream-vault-xtream',null)||readJson(localStorage,'stream-vault-xtream',null)
const publicCollection=localStorage.getItem('stream-vault-public-collection')||'world'
if(saved){$('#xtreamServer').value=saved.server||'';$('#xtreamUsername').value=saved.username||'';$('#xtreamPassword').value=saved.password||'';$('#rememberXtream').checked=Boolean(localStorage.getItem('stream-vault-xtream'));connectXtream(saved,$('#rememberXtream').checked).catch(()=>loadPublic(publicCollection))}else loadPublic(publicCollection)
