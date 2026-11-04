/* ============ ARCADA 3D INTERATIVA (modelo arcada.glb) ============
   Girar: arrastar · Zoom: rodinha/pinça · Mover: botão direito ou dois dedos
   Toque num dente: seleciona no odontograma (window.A3D_onPick) */
window.A3D = (() => {
  const V = "0.128.0", CDN = `https://cdn.jsdelivr.net/npm/three@${V}`;
  const LIBS = [`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`,
    `${CDN}/examples/js/loaders/GLTFLoader.js`, `${CDN}/examples/js/controls/OrbitControls.js`];
  const COL = { real: 0xD64545, exec: 0x2F80ED, exist: 0x27AE60, whole: 0xE9C25A, ext: 0x8A949A };
  let ready = null, S = null;

  const script = src => new Promise((ok, er) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok;
    s.onerror = () => er(new Error("Sem internet para carregar o 3D")); document.head.appendChild(s);
  });
  const load = () => ready = ready || (async () => {
    if (!window.THREE) await script(LIBS[0]);
    await script(LIBS[1]); await script(LIBS[2]);
    return build();
  })().catch(e => { ready = null; throw e; });

  function build() {
    const T = THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, .001, 10);
    camera.position.set(0, .012, .16);
    scene.add(new T.HemisphereLight(0xffffff, 0xf0e4de, 1.15));
    const key = new T.DirectionalLight(0xffffff, 1.25); key.position.set(.06, .12, .16); scene.add(key);
    const fill = new T.DirectionalLight(0xfff6ef, .8); fill.position.set(-.12, -.04, .1); scene.add(fill);
    const back = new T.DirectionalLight(0xffffff, .55); back.position.set(0, .05, -.2); scene.add(back); scene.add(new T.AmbientLight(0xffffff, .35));
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.minDistance = .05; controls.maxDistance = .32; controls.target.set(0, .0005, 0);
    const tip = document.createElement("div"); tip.className = "a3d-tip";
    const teeth = {}, base = {}, groups = {};
    const enamel = () => new T.MeshPhysicalMaterial({ color: 0xFAF7F0, roughness: .3, metalness: 0, clearcoat: .45, clearcoatRoughness: .25, sheen: 0 });
    const gumMat = new T.MeshStandardMaterial({ color: 0xEFA3A3, roughness: .5, metalness: 0 });
    return new Promise((ok, er) => new T.GLTFLoader().load("arcada.glb", g => {
      g.scene.traverse(o => {
        if (/^Arcada_/.test(o.name)) groups[o.name] = o;
        if (!o.isMesh) return;
        if (/Gengiva/.test(o.name)) { o.material = gumMat; return; }
        const m = /Dente_(\d\d)/.exec(o.name); if (!m) return;
        o.material = enamel(); o.userData.n = m[1]; teeth[m[1]] = o; base[m[1]] = o.position.clone();
      });
      scene.add(g.scene);
      S = { T, renderer, scene, camera, controls, tip, teeth, groups, open: .35, openT: .35, hover: null, sel: null, st: {} };
      wire(); loop(); ok(S);
    }, undefined, () => er(new Error("Não foi possível abrir o modelo 3D"))));
  }

  function wire() {
    const { renderer, camera, T } = S, el = renderer.domElement, ray = new T.Raycaster(), v = new T.Vector2();
    const pick = e => {
      const r = el.getBoundingClientRect(); v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, camera); const h = ray.intersectObjects(S.scene.children, true).find(i => i.object.userData.n || /Gengiva/.test(i.object.name));
      return h && h.object.userData.n ? h.object.userData.n : null;
    };
    let down = null;
    el.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
    el.addEventListener("pointerup", e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; down = null;
      const n = pick(e); if (n && window.A3D_onPick) window.A3D_onPick(n);
    });
    el.addEventListener("pointermove", e => {
      if (e.pointerType === "touch") return;
      const n = pick(e); S.hover = n; paint(); el.style.cursor = n ? "pointer" : "grab";
      if (n) { const r = el.parentNode.getBoundingClientRect(); S.tip.textContent = "Dente " + n; S.tip.style.left = (e.clientX - r.left) + "px"; S.tip.style.top = (e.clientY - r.top) + "px"; S.tip.style.display = "block"; }
      else S.tip.style.display = "none";
    });
    el.addEventListener("pointerleave", () => { S.hover = null; S.tip.style.display = "none"; paint(); });
  }

  function paint() {
    const { T, teeth, st } = S;
    for (const n in teeth) {
      const m = teeth[n].material, k = st[n];
      m.color.setHex(k ? COL[k] : 0xFAF7F0);
      if (!k) m.color.setHex(0xFAF7F0); else m.color.lerp(new T.Color(0xffffff), k === "ext" ? 0 : .12);
      m.transparent = k === "ext"; m.opacity = k === "ext" ? .28 : 1;
      m.emissive.setHex(n === S.sel ? 0x0B86AE : n === S.hover ? 0x0B86AE : 0x000000);
      m.emissiveIntensity = n === S.sel ? .55 : n === S.hover ? .25 : 0;
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!S || !document.body.contains(S.renderer.domElement)) return;
    const box = S.renderer.domElement.parentNode, w = box.clientWidth, h = box.clientHeight;
    if (S.w !== w || S.h !== h) { S.w = w; S.h = h; S.renderer.setSize(w, h, false); S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); }
    S.open += (S.openT - S.open) * .15;
    const u = S.groups.Arcada_superior, l = S.groups.Arcada_inferior, d = S.open * .012;
    if (u) u.position.y = d; if (l) { l.position.y = -d; l.rotation.x = S.open * .12; }
    S.controls.update(); S.renderer.render(S.scene, S.camera);
  }

  /* monta no elemento (chamado a cada render da tela) */
  async function mount(host, status, sel) {
    host.innerHTML = `<div class="a3d-msg">Carregando a arcada 3D…</div>`;
    try { await load(); } catch (e) { host.innerHTML = `<div class="a3d-msg">${e.message}</div>`; return; }
    if (!document.body.contains(host)) return;
    host.innerHTML = ""; host.appendChild(S.renderer.domElement); host.appendChild(S.tip);
    S.st = status || {}; S.sel = sel ? String(sel) : null; paint();
  }
  const view = k => {
    if (!S) return; const c = S.controls, cam = S.camera;
    const P = { frente: [0, .012, .16], esq: [-.15, .02, .05], dir: [.15, .02, .05], cima: [0, .17, .02], baixo: [0, -.17, .02] }[k];
    if (P) { cam.position.set(...P); c.target.set(0, .0005, 0); c.update(); }
  };
  const abrir = () => { if (S) S.openT = S.openT > .6 ? .35 : 1.6; return S && S.openT > .6; };
  return { mount, view, abrir };
})();
