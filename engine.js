const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY; 

// Lista de domínios oficiais para driblar o Cloudflare
const VIDSRC_DOMAINS = ["https://vidsrc.sh", "https://vidsrc2.ru", "https://vidsrc.ir"];
const EMBED_DOMAIN = "https://vidsrc.sh/embed"; // Mantém o principal para os links do player

const MOVIES_OUT = path.join(__dirname, 'movies.json');
const SERIES_OUT = path.join(__dirname, 'series.json');

// Disfarce mais agressivo fingindo ser a versão mais recente do Chrome
const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1'
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchFromTMDB(url) {
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (error) {
    return null; 
  }
}

// Função inteligente que tenta baixar de vários domínios se um falhar
async function fetchVidSrcList(endpoint) {
  for (const domain of VIDSRC_DOMAINS) {
    try {
      console.log(`Tentando baixar lista de: \({domain}\){endpoint}`);
      const res = await axios.get(`\({domain}\){endpoint}`, { headers: browserHeaders, timeout: 15000 });
      console.log(`✅ Sucesso ao baixar de: ${domain}`);
      return res.data;
    } catch (e) {
      console.log(`⚠️ Falha em \({domain}:\){e.message}`);
    }
  }
  throw new Error("Todos os domínios do VidSrc bloquearam a conexão.");
}

async function buildEngine() {
  console.log("Iniciando o Motor Cartoonzine VidSrc Provider...");

  if (!TMDB_API_KEY) {
    console.log("❌ ERRO CRÍTICO: A TMDB_API_KEY não foi encontrada nas Secrets!");
    process.exit(1);
  }

  let movieIds = [];
  let seriesIds = [];

  try {
    const moviesRaw = await fetchVidSrcList("/ids/movie_imdb.txt");
    const seriesRaw = await fetchVidSrcList("/ids/tv_imdb.txt");
    
    movieIds = moviesRaw.split('\n').map(id => id.trim()).filter(Boolean).slice(0, 50);
    seriesIds = seriesRaw.split('\n').map(id => id.trim()).filter(Boolean).slice(0, 50);
  } catch (err) {
    console.log("❌ ERRO FATAL AO OBTER LISTAS:", err.message);
    process.exit(1);
  }

  const moviesDB = [];
  const seriesDB = [];

  console.log(`Processando Filmes...`);
  for (const imdbId of movieIds) {
    try {
      const findData = await fetchFromTMDB(`https://api.themoviedb.org/3/find/\({imdbId}?api_key=\){TMDB_API_KEY}&external_source=imdb_id&language=pt-BR`);
      
      if (findData && findData.movie_results.length > 0) {
        const tmdbMovie = findData.movie_results[0];
        const movieDetails = await fetchFromTMDB(`https://api.themoviedb.org/3/movie/\({tmdbMovie.id}?api_key=\){TMDB_API_KEY}&language=pt-BR`);
        
        if (movieDetails) {
          moviesDB.push({
            cat: "Filmes",
            title: `\({movieDetails.title} (\){movieDetails.release_date ? movieDetails.release_date.split('-')[0] : ""})`,
            desc: movieDetails.overview || "Sinopse em breve...",
            thumb: movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : "",
            bannerThumb: movieDetails.backdrop_path ? `https://image.tmdb.org/t/p/w500${movieDetails.backdrop_path}` : "",
            url: `\({EMBED_DOMAIN}/movie/\){imdbId}`,
            year: movieDetails.release_date ? movieDetails.release_date.split('-')[0] : "",
            genre: movieDetails.genres && movieDetails.genres.length > 0 ? movieDetails.genres[0].name : "Filme",
            destaque: false
          });
          console.log(`✅ [Filme] ${movieDetails.title} adicionado.`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Erro ao processar o filme ${imdbId}`);
    }
    await delay(150);
  }

  console.log(`Processando Séries...`);
  for (const imdbId of seriesIds) {
    try {
      const findData = await fetchFromTMDB(`https://api.themoviedb.org/3/find/\({imdbId}?api_key=\){TMDB_API_KEY}&external_source=imdb_id&language=pt-BR`);
      
      if (findData && findData.tv_results.length > 0) {
        const tmdbShow = findData.tv_results[0];
        const showDetails = await fetchFromTMDB(`https://api.themoviedb.org/3/tv/\({tmdbShow.id}?api_key=\){TMDB_API_KEY}&language=pt-BR`);
        
        if (showDetails) {
          const seasonsArray = [];

          if (showDetails.seasons) {
            for (const season of showDetails.seasons) {
              if (season.season_number === 0) continue; 
              const episodesArray = [];
              for (let ep = 1; ep <= season.episode_count; ep++) {
                episodesArray.push({
                  season: season.season_number,
                  episode: ep,
                  url: `\({EMBED_DOMAIN}/tv/\){imdbId}/\({season.season_number}/\){ep}`
                });
              }
              if (episodesArray.length > 0) {
                seasonsArray.push({ season: season.season_number, episodes: episodesArray });
              }
            }
          }

          seriesDB.push({
            cat: "Séries",
            title: showDetails.name,
            desc: showDetails.overview || "Sinopse em breve...",
            thumb: showDetails.poster_path ? `https://image.tmdb.org/t/p/w500${showDetails.poster_path}` : "",
            bannerThumb: showDetails.backdrop_path ? `https://image.tmdb.org/t/p/w500${showDetails.backdrop_path}` : "",
            year: showDetails.first_air_date ? showDetails.first_air_date.split('-')[0] : "",
            genre: showDetails.genres && showDetails.genres.length > 0 ? showDetails.genres[0].name : "Série",
            destaque: false,
            seasons: seasonsArray
          });
          console.log(`✅ [Série] ${showDetails.name} adicionada.`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Erro ao processar a série ${imdbId}`);
    }
    await delay(150);
  }

  fs.writeFileSync(MOVIES_OUT, JSON.stringify(moviesDB, null, 2));
  fs.writeFileSync(SERIES_OUT, JSON.stringify(seriesDB, null, 2));
  console.log("Geração concluída com sucesso!");
}

buildEngine();
