//! Local AI substrate — LLM + embedder traits, corpus chunking, RAG retrieval,
//! and prompt templates. Concrete model loading + inference live in Plan 1.2.

pub mod corpus;
pub mod embedder;
pub mod prompts;
pub mod retriever;
pub mod runtime;
