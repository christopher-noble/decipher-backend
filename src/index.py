from flask import Flask, request, jsonify
from flask_cors import CORS
from pytube import YouTube
import sys
import os
from .api.controllers.transcribe_controller import transcribe
from .utils.constants import *

# Application object w/ Flask constructor
app = Flask(__name__)
CORS(app, resources={r"/transcribe": {"origins": "http://localhost:3000"}})

# root/endpoint: /transcribe
# @app.route decorator - called whenever a request hits the server with this path
# Request Content-Type: multipart/formData
@app.route('/transcribe', methods=['POST'])
def wrapper(): 
    return transcribe()

# Run the Flask server
if __name__ == "__main__":
    app.run(debug=True)
