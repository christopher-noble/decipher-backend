from flask import Flask, request, jsonify
from flask_cors import CORS
from pytube import YouTube
from .api.controllers.transcribe_controller import transcribe
from .utils.constants import *
from .api.routes.transcribe import transcribe_blueprint

# Application object w/ Flask constructor
app = Flask(__name__)
CORS(app, resources={r"/transcribe": {"origins": "http://localhost:3000"}})

# For joel: endpoint is now /api/transcribe instead of /transcribe. Pull changes from front-end
app.register_blueprint(transcribe_blueprint, url_prefix='/api')

# Run the Flask server
if __name__ == "__main__":
    app.run(debug=True)
