# Redpanda Connect GenAI Gaming Demo

This guide walks you through setting up a Redpanda Cluster and integrating it with local Ollama, OpenAI services, and a PostgreSQL vector database for a dynamic and immersive role-playing game (RPG) demo. The demo features NPC interactions powered by LLMs and event-driven architecture.

## Setup Redpanda Cluster

Clone the Repository and Start the Redpanda Cluster:

```
git clone https://github.com/weimeilin79/redpanda-connect-genai-gaming-demo.git
cd redpanda-connect-genai-gaming-demo
docker-compose up -d
```

- Configure rpk Profile:
```
rpk profile create local
rpk profile set kafka_api.brokers=localhost:19092,localhost:29092,localhost:39092
rpk profile set admin_api.addresses=localhost:19644,localhost:29644,localhost:39644
rpk profile use local
```

-  Create Topics:
```
rpk topic create bonus npc-request npc1-request npc2-request npc3-request rpg-response
```

-  Set Environment Variables:
```
cd ~/redpanda-connect-genai-gaming-demo
cat > .env <<EOF
REDPANDA_BROKERS="localhost:19092,localhost:29092,localhost:39092"
EOF
```
## Ollama Setup
-  Pull the Ollama Model:
```
ollama pull llama3.1:8b
```
-  Set Ollama Environment Variable:
```
echo 'LOCAL_LLM_ADDR="http://127.0.0.1:11434"' >> .env
```

## OpenAI Setup

Obtain an OpenAI API Key:
- Go to OpenAI's [website](https://platform.openai.com/signup) and sign up for an account.
- Navigate to the API Keys section and create a new secret key.

## Setting Up Vector Database
- Pull the Latest Nomic Embedding Model:
```
ollama pull nomic-embed-text
```
- Log into the PostgreSQL Database with password `secret`:
```
psql -h localhost -p 5432 --username root
```
- Create HNSW Index:
```
CREATE INDEX IF NOT EXISTS text_hnsw_index ON whisperingrealm USING hnsw (embedding vector_l2_ops);
```
- Set Environment Variables:
```  
echo 'PGVECTOR_USER="root"' >> .env
echo 'PGVECTOR_PWD="secret"' >> .env
```
## Create Embedding Pipeline

- Create Embedding Pipeline Configuration:
```
cat > pg-embedding.yaml <<EOF
input:
  file:
    paths: [ ./story/*.md ]
    scanner:
      to_the_end: {}
pipeline:
  processors:
    - mapping: |
        meta text = content()
    - branch:
        processors:
          - ollama_embeddings:
              server_address: "\${LOCAL_LLM_ADDR}"
              model: nomic-embed-text
        result_map: |-
          root.embeddings = this
          root.text = metadata("text").string()
          root.key = metadata("path").string()
    - log:
        message: \${! json("embeddings") }
output:
 sql_insert:
    driver: postgres
    dsn: "postgresql://\${PGVECTOR_USER}:\${PGVECTOR_PWD}@localhost:5432/root?sslmode=disable"
    table: whisperingrealm
    columns: ["key", "doc", "embedding"]
    args_mapping: "[this.key, this.text, this.embeddings.vector()]"
EOF

```

- Start the Embedding Pipeline:
  
```
redpanda-connect run -e .env pg-embedding.yaml
```

- Verify Data in PostgreSQL:
```
SELECT LEFT(key, 25) as key, LEFT(doc, 35) as doc from whisperingrealm;
```

## Dynamic NPC Interactions with RAG

- Create RAG Pipeline for NPC 1, the Hero:
```
cat > npc1-genai-rag.yaml <<EOF
input:
  kafka_franz:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics: ["npc1-request"]
    consumer_group: "ollama-npc1"
pipeline:
  processors:
    - log:
        message: \${! content() }
    - mapping: |
        meta original_question = content()
    - branch:
        processors:
          - ollama_embeddings:
              server_address: "\${LOCAL_LLM_ADDR}"
              model: nomic-embed-text
        result_map: |-
            root.embeddings = this
            root.question = content()
    - branch:
       processors:
          - sql_raw:
              driver: "postgres"
              dsn: "postgresql://\${PGVECTOR_USER}:\${PGVECTOR_PWD}@localhost:5432/root?sslmode=disable"
              query: SELECT doc FROM whisperingrealm ORDER BY embedding <-> \$1 LIMIT 1
              args_mapping: root = [ this.embeddings.vector() ]
       result_map: |-
          root.embeddings = deleted()
          root.question = deleted()
          root.search_results = this
    - log:
        message: \${! json("search_results") }
    - ollama_chat:
        server_address: "\${LOCAL_LLM_ADDR}"
        model: llama3.1:8b
        prompt:  \${! meta("original_question") }
        system_prompt: You are the hero Corin in this fantasy world and say no more than 5 sentences and in an upbeat tone. \${! json("search_results") }
    - mapping: |
        root = {
          "who": "npc1",
          "msg":  content().string()
        }
    - log:
        message: \${! json() }
output:
  kafka_franz:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: "rpg-response"
    compression: none
EOF
```

- Start the NPC 1 RAG Pipeline:
  
```
redpanda-connect run -e .env npc1-genai-rag.yaml 
```

- Create RAG Pipeline for NPC 2, the sorcerer:

```
cat > npc2-openai-rag.yaml <<EOF
input:
  kafka_franz:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics: ["npc2-request"]
    consumer_group: "openai-npc2"
pipeline:
  processors:
    - log:
        message: \${! content() }
    - mapping: |
        meta original_question = content()
    - branch:
        processors:
          - ollama_embeddings:
              server_address: "\${LOCAL_LLM_ADDR}"
              model: nomic-embed-text
        result_map: |-
            root.embeddings = this
            root.question = content()
    - branch:
       processors:
          - sql_raw:
              driver: "postgres"
              dsn: "postgresql://\${PGVECTOR_USER}:\${PGVECTOR_PWD}@localhost:5432/root?sslmode=disable"
              query: SELECT doc FROM whisperingrealm ORDER BY embedding <-> \$1 LIMIT 3
              args_mapping: root = [ this.embeddings.vector() ]
       result_map: |-
          root.embeddings = deleted()
          root.question = meta("original_question")
          root.search_results = this
    - log:
        message: \${! json("search_results") }
    - openai_chat_completion:
        server_address: https://api.openai.com/v1
        api_key: \${OPENAI_KEY}
        model: gpt-4o
        system_prompt: You are a sorcerer Lyria in this fantasy world, specialized in light magic and say no more than 5 sentences and in a shy tone.
    - mapping: |
        root = {
          "who": "npc2",
          "msg":  content().string()
        }
    - log:
        message: \${! json() }
output:
  kafka_franz:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: "rpg-response"
    compression: none
EOF

```

- Start the NPC 2 RAG Pipeline:

```
redpanda-connect run -e .env npc2-openai-rag.yaml
```

## Rerouting
- Create Dynamic Routing Configuration:
```
cat > npc-reroute.yaml <<EOF
input:
  kafka_franz:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics: ["npc-request"]
    consumer_group: "npc-reroute"
output:
  switch:
    cases:
      - check: this.who == "npc1"
        output:
          kafka_franz:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: npc1-request
          processors:
            - type: bloblang
              bloblang: |
                root = this.msg
      - check: this.who == "npc2"
        output:
          kafka_franz:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: npc2-request
          processors:
            - type: bloblang
              bloblang: |
                root = this.msg
EOF

```
- Start the Rerouting Pipeline:
```
rpk connect run -e .env npc-reroute.yaml 
```

## Dynamic Character Abilities
- Create Bonus Abilities Pipeline:
```
cat > bonus.yaml <<EOF
input:
  kafka_franz:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics: ["npc-request"]
    consumer_group: "npc-bonus"
pipeline:
  processors:
    - bloblang: |
          let npc1_abilities = [
            {"type": "courage", "bonus": random_int(min:1, max:5)},
            {"type": "strength", "bonus": random_int(min:1, max:5)},
            {"type": "HP", "bonus": random_int(min:1, max:5)}
          ]
          let npc2_abilities = [
            {"type": "agility", "bonus": random_int(min:1, max:5)},
            {"type": "wisdom", "bonus": random_int(min:1, max:5)},
            {"type": "MP", "bonus": random_int(min:1, max:5)}
          ]

          let npc1_ability = \$npc1_abilities.index(random_int(min:0, max:2))
          let npc2_ability = \$npc2_abilities.index(random_int(min:0, max:2))
          if this.who == "npc1" {
            root.bonus = \$npc1_ability.type + " +" + \$npc1_ability.bonus.string()
          } else if this.who == "npc2" {
            root.bonus = \$npc2_ability.type + " +" + \$npc2_ability.bonus.string()
          } else {
            root.bonus = "luck -1"
          }
output:
  kafka_franz:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: bonus
EOF
```
- Start the Bonus Abilities Pipeline:
  
```
rpk connect run -e .env bonus.yaml
```

## Test with Frontend
- Navigate to the Frontend Directory and Install Dependencies:
```
cd ../frontend
npm install
```


- Start the Frontend Application:
```
node index.js &
```

The prototype should be available at http://localhost:80

Interact with the Game:
- Ask questions like "Tell me about the realm?" or "What do you know about the Fiend King?"
- Observe character abilities and interactions with NPCs.


## Conclusion

By following this guide, you’ve set up a dynamic, event-driven gaming demo using Redpanda Connect, integrating LLMs, vector databases, and real-time processing. This setup creates a rich, immersive experience where NPC interactions are enhanced by the underlying infrastructure, encouraging deeper player engagement.