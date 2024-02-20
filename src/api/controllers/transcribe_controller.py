""" 
Business logic for API endpoints
"""

from flask import jsonify, request
from src.services.transcribe_service import *
from src.utils.constants import *
import yt_dlp

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
            url = YOUTUBE_URL_BASE + input_url
            try:
                ydl_opts = {
                    'format': 'mp3/bestaudio/best',
                    'outtmpl' : f'{DOWNLOADS_FOLDER}/%(id)s.%(ext)s' , # Label the downloaded file by video ID
                    'postprocessors': [{  # Extract audio using ffmpeg
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                    }]
                }

                # Extract audio from YouTube video
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    status_code = ydl.download([url])
                    
                print(status_code)

                try:
                    with open(f"{DOWNLOADS_FOLDER}/{input_url}.mp3", "rb") as f:
                        S3_CLIENT.upload_fileobj(f, BUCKET_NAME, object_key)
                    start_transcription_job(BUCKET_NAME, object_key, job_name)

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