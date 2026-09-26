const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Agora usaremos o Token Gigante (v4)
const TMDB_TOKEN = process.env.TMDB_API_KEY; 
const EMBED_DOMAIN = "https://vidsrc.sh/embed";

const MOVIES_OUT = path.join(__dirname, 'movies.json');
const SERIES_OUT = path.join(__dirname, 'series.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuração do cabeçalho de segurança do TMDB
const tmdbOptions = {
  headers: {
    'Accept': 'application/json',
    'Authorization': `Bearer ${TMDB_TOKEN}`
  }
};

async function buildEngine() {
  console.log("Iniciando Motor Cartoonzine VidSrc Provider (Modo Token v4)...");

  if (!TMDB_TOKEN) {
    console.log("❌ ERRO CRÍTICO: O Token do TMDB não foi encontrado nas Secrets!");
    process.exit(1);
  }

  const moviesDB = [];
  const seriesDB = [];

  try {
    console.log("✅ Buscando Lançamentos e Populares no TMDB...");
    
    let tmdbMovies = [];
    for (let page = 1; page <= 2; page++) {
      const res = await axios.get(`https://api.themoviedb.org/3/movie/popular?language=pt-BR&page=${page}`, tmdbOptions);
      tmdbMovies = tmdbMovies.concat(res.data.results);
    }

    let tmdbSeries = [];
    for (let page = 1; page <= 2; page++) {
      const res = await axios.get(`https://api.themoviedb.org/3/tv/popular?language=pt-BR&page=${page}`, tmdbOptions);
      tmdbSeries = tmdbSeries.concat(res.data.results);
    }

    console.log(`🎬 Encontrados: \({tmdbMovies.length} Filmes e\){tmdbSeries.length} Séries. Montando o Banco...`);

    // Processar Filmes
    for (const m of tmdbMovies) {
      try {
        const details = await axios.get(`https://api.themoviedb.org/3/movie/${m.id}?language=pt-BR`, tmdbOptions);
        const movieDetails = details.data;

        if (movieDetails && movieDetails.imdb_id) {
          moviesDB.push({
            cat: "Filmes",
            title: `\({movieDetails.title} (\){movieDetails.release_date ? movieDetails.release_date.split('-')[0] : ""})`,
            desc: movieDetails.overview || "Sinopse em breve...",
            thumb: movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : "",
            bannerThumb: movieDetails.backdrop_path ? `https://image.tmdb.org/t/p/w500${movieDetails.backdrop_path}` : "",
            url: `\({EMBED_DOMAIN}/movie/\){movieDetails.imdb_id}`,
            year: movieDetails.release_date ? movieDetails.release_date.split('-')[0] : "",
            genre: movieDetails.genres && movieDetails.genres.length > 0 ? movieDetails.genres[0].name : "Filme",
            destaque: false
          });
          console.log(`✅ [Filme OK] ${movieDetails.title}`);
        }
      } catch (e) {
        console.log(`⚠️ Erro ao processar o filme ID ${m.id}`);
      }
      await delay(150);
    }

    // Processar Séries
    for (const s of tmdbSeries) {
      try {
        const details = await axios.get(`https://api.themoviedb.org/3/tv/${s.id}?language=pt-BR`, tmdbOptions);
        const showDetails = details.data;
        
        const extIds = await axios.get(`https://api.themoviedb.org/3/tv/${s.id}/external_ids`, tmdbOptions);
        const imdbId = extIds.data.imdb_id;

        if (showDetails && imdbId) {
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
      } catch (e) {
        console.log(`⚠️ Erro ao processar a série ID ${s.id}`);
      }
      await delay(150);
    }

    if (moviesDB.length === 0 && seriesDB.length === 0) {
      console.log("❌ Nenhum dado formatado. Abortando!");
      process.exit(1);
    }

    fs.writeFileSync(MOVIES_OUT, JSON.stringify(moviesDB, null, 2));
    fs.writeFileSync(SERIES_OUT, JSON.stringify(seriesDB, null, 2));
    console.log(`🎉 Sucesso! Salvos \({moviesDB.length} filmes e\){seriesDB.length} séries no banco.`);

  } catch (err) {
    console.error("Erro Fatal na API do TMDB:", err.message);
    process.exit(1);
  }
}

buildEngine();
