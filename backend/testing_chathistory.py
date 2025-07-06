import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory

# Load your Gemini API key
load_dotenv()
os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY")
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
os.environ["LANGCHAIN_PROJECT"] = "PyBuddy_Creating_Questions" # Give your project a name

# Initialize the LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    temperature=0.7,
)

# Attach memory to the conversation chain
memory = ConversationBufferMemory(return_messages=True)

# Build a conversation chain that includes memory
conversation = ConversationChain(
    llm=llm,
    memory=memory,
    verbose=True  # This prints the internal prompt
)

# First message
response1 = conversation.predict(input="What is AI?")
print("Bot:", response1)

# Second message (remembers the first)
response2 = conversation.predict(input="Can you give an example?")
print("Bot:", response2)

response3 = conversation.predict(input="What was my first question to you?")
print("Bot:", response3)

# View history
print("\nConversation History:")
for msg in memory.chat_memory.messages:
    print(f"[{msg.type}] {msg.content}")
