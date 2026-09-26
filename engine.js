const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const VIDSRC_DOMAINS = ["https://vidsrc.sh", "https://vidsrc2.ru", "https://vidsrc.ir"];
const EMBED_DOMAIN = "https://vidsrc.sh/embed";

const MOVIES_OUT = path.join(__dirname, 'movies.json');
const SERIES_OUT = path.join(__dirname, 'series.json');

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*'
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

// Busca IDs tentando primeiro a API JSON (menos bloqueada) e depois o TXT
async function getIds(type) {
  const jsonEndpoint = type === 'movie' ? "/movies/latest/page-1.json" : "/tvshows/latest/page-1.json";
  
  for (const domain of VIDSRC_DOMAINS) {
    try {
      console.log(`Tentando API JSON em: \({domain}\){jsonEndpoint}`);
      const res = await axios.get(`\({domain}\){jsonEndpoint}`, { headers: browserHeaders, timeout: 10000 });
      if (res.data && res.data.result) {
        const ids = res.data.result.map(item => item.imdb_id).filter(id => id && id.startsWith('tt'));
        if (ids.length > 0) {
          console.log(`✅ Sucesso via API JSON no domínio ${domain}`);
          return ids.slice(0, 50); // Pegamos os primeiros 50
        }
      }
    } catch (e) {}
  }

  const txtEndpoint = type === 'movie' ? "/ids/movie_imdb.txt" : "/ids/tv_imdb.txt";
  for (const domain of VIDSRC_DOMAINS) {
    try {
      console.log(`Tentando TXT em: \({domain}\){txtEndpoint}`);
      const res = await axios.get(`\({domain}\){txtEndpoint}`, { headers: browserHeaders, timeout: 10000 });
      if (typeof res.data === 'string' && res.data.includes('tt')) {
         const ids = res.data.match(/tt\d+/g);
         if (ids && ids.length > 0) {
           console.log(`✅ Sucesso via TXT no domínio ${domain}`);
           // Pegamos 50 IDs únicos
           return [...new Set(ids)].slice(0, 50);
         }
      }
    } catch (e) {}
  }
  return [];
}

async function buildEngine() {
  console.log("Iniciando o Motor Cartoonzine VidSrc Provider...");

  if (!TMDB_API_KEY) {
    console.log("❌ ERRO CRÍTICO: A TMDB_API_KEY não foi encontrada nas Secrets!");
    process.exit(1);
  }

  // 1. Testa a chave do TMDB
  const tmdbTest = await fetchFromTMDB(`https://api.themoviedb.org/3/configuration?api_key=${TMDB_API_KEY}`);
  if (!tmdbTest) {
    console.log("❌ ERRO CRÍTICO: A sua Chave do TMDB é inválida ou foi bloqueada!");
    process.exit(1);
  } else {
    console.log("✅ Conexão com o TMDB estabelecida com sucesso!");
  }

  // 2. Busca os IDs blindando contra o Cloudflare
  let movieIds = await getIds('movie');
  let seriesIds = await getIds('tv');

  if (movieIds.length === 0 && seriesIds.length === 0) {
    console.log("❌ ERRO FATAL: O Cloudflare bloqueou todas as tentativas. Nenhum ID foi encontrado.");
    process.exit(1);
  }

  console.log(`🎬 Encontrados: \({movieIds.length} Filmes e\){seriesIds.length} Séries. Extraindo capas...`);

  const moviesDB = [];
  const seriesDB = [];

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
          console.log(`✅ [Filme OK] ${movieDetails.title}`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Erro ao processar o filme ${imdbId}`);
    }
    await delay(150);
  }

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
          console.log(`✅ [Série OK] ${showDetails.name}`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Erro ao processar a série ${imdbId}`);
    }
    await delay(150);
  }

  if (moviesDB.length === 0 && seriesDB.length === 0) {
    console.log("❌ Nenhum dado foi formatado. Abortando para não salvar arquivos em branco!");
    process.exit(1);
  }

  fs.writeFileSync(MOVIES_OUT, JSON.stringify(moviesDB, null, 2));
  fs.writeFileSync(SERIES_OUT, JSON.stringify(seriesDB, null, 2));
  console.log(`🎉 Sucesso! Salvos \({moviesDB.length} filmes e\){seriesDB.length} séries no banco.`);
}

buildEngine();
