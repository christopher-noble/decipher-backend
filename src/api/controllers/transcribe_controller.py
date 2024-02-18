""" 
Business logic for API endpoints
"""

from flask import jsonify, request
from pytube import YouTube
import os
from src.services.transcribe_service import *
from src.utils.constants import *

# # Calculate the path to the directory two levels up
# current_dir = os.path.dirname(__file__)
# parent_dir = os.path.dirname(current_dir)
# grandparent_dir = os.path.dirname(parent_dir)

# # Add the grandparent directory to sys.path
# sys.path.append(grandparent_dir)


def transcribe():
    try:
        # File Upload Transcription Logic
        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No selected file"}), 400

            # Log some details
            job_name = request.form['jobName']
            object_key = file.filename
            file_object = file.stream

            # TODO validate length
            try:
                S3_CLIENT.upload_fileobj(file_object, BUCKET_NAME, file.filename)
                start_transcription_job(BUCKET_NAME, object_key, job_name)

                try:
                    result = get_transcription_job_result(job_name)
                    return result
                except Exception as e:
                    return jsonify({'error': f"Exception encountered while retrieving transcript. error: {str(e)}"})

            except Exception as e:
                return jsonify({'error': f"Exception encountered while uploading MP3 to S3 and starting job."
                                         f"error: {str(e)}"})

        # YouTube Transcription Logic
        # TODO validate length
        elif 'inputUrlRef' in request.form.keys():
            input_url = request.form['inputUrlRef']
            job_name = request.form['jobName']
            object_key = input_url + ".mp3"
            try:
                url = YOUTUBE_URL_BASE + input_url
                video = YouTube(url)
                file_object = video.streams.filter(only_audio=True).first()
                file_object.download(filename=f"{input_url}.mp3")

                try:
                    with open(f"{input_url}.mp3", "rb") as f:
                        S3_CLIENT.upload_fileobj(f, BUCKET_NAME, object_key)
                    start_transcription_job(BUCKET_NAME, object_key, job_name)

                    # Delete the file.
                    location = "C:/Users/joels/PycharmProjects/decipher-backend/"
                    path = os.path.join(location, object_key)
                    os.remove(path)

                    try:
                        result = get_transcription_job_result(job_name)
                        return result
                    except Exception as e:
                        return jsonify({'error': f"Exception encountered while retrieving transcript. error: {str(e)}"})

                except Exception as e:
                    return jsonify({'error': f"Exception encountered while uploading MP3 to S3 and starting job."
                                             f"error: {str(e)}"})

            except Exception as e:
                return jsonify({"error": f"Exception encountered while converting YT to MP3."
                                         f"Please check the video URL or your network connection."
                                         f"error: {str(e)}"})

        else:
            return jsonify({"error": "No file found"}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500