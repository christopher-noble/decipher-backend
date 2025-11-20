from flask import Blueprint
from src.api.controllers.transcribe_controller import transcribe

transcribe_blueprint = Blueprint('transcribe', __name__)

@transcribe_blueprint.route('/transcribe', methods=['POST'])
def wrapper():
    return transcribe()