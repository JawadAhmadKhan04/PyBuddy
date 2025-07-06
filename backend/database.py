from redis import Redis
import json
class Database:
    
    def __init__(self):
        self.redis = Redis(host='localhost', port=6379, db=0)
    
    def save_doc(self, doc_name: str, questions: dict):
        print(questions)
        self.redis.set(doc_name, json.dumps(questions))
        print("-"*50)

    def get_doc(self, doc_name: str, question_no: int):
        raw_data = self.redis.get(doc_name)
        if raw_data:
            data = json.loads(raw_data.decode())  # Decode bytes → str → dict
            return data
        return None
    

    def delete_doc(self, doc_name: str):
        self.redis.delete(doc_name)

    def get_all_docs(self):
        return self.redis.keys()