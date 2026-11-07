# Site ETERNAL — agenciaeternal.com.br

Site institucional da ETERNAL, agência de posicionamento e presença digital.
Site estático (HTML, CSS e JavaScript), sem etapa de build.

## O que tem aqui

- `index.html` — a página.
- `assets/css/site.css` — estilos.
- `assets/js/` — animações (GSAP + ScrollTrigger + Lenis), logo em partículas (WebGL), demonstração da IA.
- `assets/media/` — cenas em vídeo geradas no Higgsfield (`sN.mp4` para computador, `sN-m.mp4` para celular), pôsteres e a trilha ambiente.
- `assets/img/` — fotos dos serviços, favicon, imagem de compartilhamento (og.jpg).
- `vercel.json` — cache dos arquivos e cabeçalhos de segurança.

## Publicar na Vercel

1. Vercel → **Add New… → Project** → importar `site-eternal`.
2. Framework Preset: **Other**. Build Command: vazio. Output Directory: vazio (raiz).
3. **Deploy**.
4. Project → **Settings → Domains** → adicionar `agenciaeternal.com.br` e `www.agenciaeternal.com.br`, e configurar o DNS que a Vercel indicar.

Cada envio para a branch `main` publica o site de novo automaticamente.
