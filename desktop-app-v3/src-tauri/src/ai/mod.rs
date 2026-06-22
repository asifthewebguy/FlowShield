//! Local AI substrate — LLM + embedder traits, corpus chunking, RAG retrieval,
//! and prompt templates. Concrete model loading + inference live in Plan 1.2.

pub mod briefing;
pub mod candle_embedder;
pub mod candle_llm;
pub mod corpus;
pub mod empty_state;
pub mod embedder;
pub mod indexer;
pub mod model_download;
pub mod prompts;
pub mod registry;
pub mod retriever;
pub mod runtime;
pub mod scheduler;
