from flask import Flask, request, jsonify
from flask_cors import CORS
from .api.controllers.transcribe_controller import transcribe
from .utils.constants import *
from .api.routes.transcribe import transcribe_blueprint

app = Flask(__name__)
CORS(app, resources={r"/api/transcribe": {"origins": "http://localhost:3000"}})

app.register_blueprint(transcribe_blueprint, url_prefix='/api')

if __name__ == "__main__":
    app.run(debug=True)
