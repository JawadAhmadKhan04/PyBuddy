from redis import Redis
import json
class Database:
    
    def __init__(self):
        self.redis = Redis(host='localhost', port=6379, db=0)

    def set_api(self, username: str, api_key: str):
        user_data = self._get_or_create_user(username)
        user_data['api_key'] = api_key
        self.redis.set(username, json.dumps(user_data))

    def get_api(self, username: str):
        user_data = self._get_or_create_user(username)
        return user_data.get('api_key')

    def set_github(self, username: str, github_name: str, github_token: str):
        user_data = self._get_or_create_user(username)
        user_data['github_name'] = github_name
        user_data['github_token'] = github_token
        self.redis.set(username, json.dumps(user_data))

    def get_github(self, username: str):
        user_data = self._get_or_create_user(username)
        print(user_data)
        return {
            'github_name': user_data.get('github_name'),
            'github_token': user_data.get('github_token')
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

  