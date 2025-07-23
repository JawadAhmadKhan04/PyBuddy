import os
from redis import Redis
import json
from cryptography.fernet import Fernet
class Database:
    
    def __init__(self):
        self.redis = Redis(host='localhost', port=6379, db=0)
        encryption_key = os.environ.get('PYBUDDY_ENCRYPTION_KEY')
        if not encryption_key:
            raise ValueError('Encryption key not set in environment variable PYBUDDY_ENCRYPTION_KEY')
        self.cipher = Fernet(encryption_key)

    def set_api(self, username: str, api_key: str):
        user_data = self._get_or_create_user(username)
        encrypted_api_key = self.cipher.encrypt(api_key.encode()).decode()
        user_data['api_key'] = encrypted_api_key
        self.redis.set(username, json.dumps(user_data))

    def get_api(self, username: str):
        user_data = self._get_or_create_user(username)
        encrypted_api_key = user_data.get('api_key')
        if encrypted_api_key:
            try:
                return self.cipher.decrypt(encrypted_api_key.encode()).decode()
            except Exception:
                return None
        return None

    def set_github(self, username: str, github_name: str, github_token: str):
        user_data = self._get_or_create_user(username)
        user_data['github_name'] = github_name
        encrypted_github_token = self.cipher.encrypt(github_token.encode()).decode()
        user_data['github_token'] = encrypted_github_token
        self.redis.set(username, json.dumps(user_data))

    def get_github(self, username: str):
        user_data = self._get_or_create_user(username)
        encrypted_github_token = user_data.get('github_token')
        github_token = None
        if encrypted_github_token:
            try:
                github_token = self.cipher.decrypt(encrypted_github_token.encode()).decode()
            except Exception:
                github_token = None
        return {
            'github_name': user_data.get('github_name'),
            'github_token': github_token
        }
    
    def delete_github(self, username: str):
        user_data = self._get_or_create_user(username)
        if 'github_name' in user_data:
            del user_data['github_name']
        if 'github_token' in user_data:
            del user_data['github_token']
        self.redis.set(username, json.dumps(user_data))
    
    def _get_or_create_user(self, username: str):
        data = self.redis.get(username)
        if data:
            return json.loads(data)
        return {}

  