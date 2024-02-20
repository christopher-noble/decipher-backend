from flask import Blueprint
from src.api.controllers.transcribe_controller import transcribe

transcribe_blueprint = Blueprint('transcribe', __name__)

# root/endpoint: /transcribe
# @transcribe_blueprint.route - called whenever a request hits the server with this path
# Request Content-Type: multipart/formData
@transcribe_blueprint.route('/transcribe', methods=['POST'])
def wrapper(): 
    return transcribe()