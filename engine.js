const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_TOKEN = process.env.TMDB_API_KEY; 
const EMBED_DOMAIN = "https://vidsrc.sh/embed";

const MOVIES_OUT = path.join(__dirname, 'movies.json');
const SERIES_OUT = path.join(__dirname, 'series.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const tmdbOptions = {
  headers: {
    'Accept': 'application/json',
    'Authorization': `Bearer ${TMDB_TOKEN}`
  }
};

async function buildEngine() {
  console.log("Iniciando Motor Cartoonzine VidSrc Provider (Modo Catálogo Gigante)...");

  if (!TMDB_TOKEN) {
    console.log("❌ ERRO CRÍTICO: O Token do TMDB não foi encontrado nas Secrets!");
    process.exit(1);
  }

  const moviesDB = [];
  const seriesDB = [];

  try {
    console.log("✅ Coletando IDs em massa do TMDB (Múltiplas páginas)...");
    
    let tmdbMovies = [];
    // Varre até 15 páginas de filmes populares/em alta (~300 a 400 filmes)
    for (let page = 1; page <= 15; page++) {
      try {
        const res = await axios.get(`https://api.themoviedb.org/3/movie/popular?language=pt-BR&page=${page}`, tmdbOptions);
        if (res.data && res.data.results) {
          tmdbMovies = tmdbMovies.concat(res.data.results);
        }
      } catch (e) { break; }
    }

    let tmdbSeries = [];
    // Varre até 15 páginas de séries populares/em alta (~300 a 400 séries)
    for (let page = 1; page <= 15; page++) {
      try {
        const res = await axios.get(`https://api.themoviedb.org/3/tv/popular?language=pt-BR&page=${page}`, tmdbOptions);
        if (res.data && res.data.results) {
          tmdbSeries = tmdbSeries.concat(res.data.results);
        }
      } catch (e) { break; }
    }

    console.log(`🎬 Total bruto coletado: \({tmdbMovies.length} Filmes e\){tmdbSeries.length} Séries. Processando metadados e links...`);

    // Processar Filmes
    for (const m of tmdbMovies) {
      try {
        const details = await axios.get(`https://api.themoviedb.org/3/movie/${m.id}?language=pt-BR`, tmdbOptions);
        const movieDetails = details.data;

        const extRes = await axios.get(`https://api.themoviedb.org/3/movie/${m.id}/external_ids`, tmdbOptions);
        const imdbId = extRes.data.imdb_id;

        if (movieDetails && imdbId) {
          const year = movieDetails.release_date ? movieDetails.release_date.split('-')[0] : "";
          
          moviesDB.push({
            cat: "Filmes",
            title: `\({movieDetails.title} (\){year})`,
            desc: movieDetails.overview || "Sinopse em breve...",
            thumb: movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : "",
            bannerThumb: movieDetails.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movieDetails.backdrop_path}` : "",
            url: `\({EMBED_DOMAIN}/movie/\){imdbId}`,
            year: year,
            genre: movieDetails.genres && movieDetails.genres.length > 0 ? movieDetails.genres[0].name : "Filme",
            destaque:
          });
        }
      } catch (e) {}
      await delay(100); // Delay otimizado para ir mais rápido
    }

    // Processar Séries
    for (const s of tmdbSeries) {
      try {
        const details = await axios.get(`https://api.themoviedb.org/3/tv/${s.id}?language=pt-BR`, tmdbOptions);
        const showDetails = details.data;
        
        const extIds = await axios.get(`https://api.themoviedb.org/3/tv/${s.id}/external_ids`, tmdbOptions);
        const imdbId = extIds.data.imdb_id;

        if (showDetails && imdbId) {
          const year = showDetails.first_air_date ? showDetails.first_air_date.split('-')[0] : "";
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
            bannerThumb: showDetails.backdrop_path ? `https://image.tmdb.org/t/p/w1280${showDetails.backdrop_path}` : "",
            year: year,
            genre: showDetails.genres && showDetails.genres.length > 0 ? showDetails.genres[0].name : "Série",
            destaque: false,
            seasons: seasonsArray
          });
        }
      } catch (e) {}
      await delay(100);
    }

    if (moviesDB.length === 0 && seriesDB.length === 0) {
      console.log("❌ Nenhum dado formatado. Abortando!");
      process.exit(1);
    }

    fs.writeFileSync(MOVIES_OUT, JSON.stringify(moviesDB, null, 2));
    fs.writeFileSync(SERIES_OUT, JSON.stringify(seriesDB, null, 2));
    console.log(`🎉 Sucesso Absoluto! Salvos \({moviesDB.length} filmes e\){seriesDB.length} séries completos com URLs e capas.`);

  } catch (err) {
    console.error("Erro Fatal na execução:", err.message);
    process.exit(1);
  }
}

buildEngine();
