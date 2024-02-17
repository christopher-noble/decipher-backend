from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import time
import json
from pytube import YouTube
import os
# from .utils.constants import *


BUCKET_NAME = "decipher-audio-files"
S3_CLIENT = boto3.client('s3')
TRANSCRIBE_CLIENT = boto3.client('transcribe', region_name='us-west-2')
FILE_MAX_DURATION_SECONDS = 300
MAX_RETRIEVE_ATTEMPTS = 50
YOUTUBE_URL_BASE = "https://www.youtube.com/watch?v="


# Application object w/ Flask constructor
app = Flask(__name__)
CORS(app, resources={r"/transcribe": {"origins": "http://localhost:3000"}})


# Start a transcription job
def start_transcription_job(bucket_name, object_key, job_name, language_code='en-US'):
    TRANSCRIBE_CLIENT.start_transcription_job(
        TranscriptionJobName=job_name,
        LanguageCode=language_code,
        MediaFormat='mp3',  # replace with your audio format
        Media={'MediaFileUri': f's3://{bucket_name}/{object_key}'},
        OutputBucketName=bucket_name  # specify the bucket for the transcription output
    )


# Download the json once the job is complete
def get_completed_transcript(bucket_name, object_key):
    response = S3_CLIENT.get_object(Bucket=bucket_name, Key=object_key)
    transcription_result = response['Body'].read().decode('utf-8')
    return transcription_result


# Get the result. Max 50 attempts (for now).
def get_transcription_job_result(job_name):
    attempts = 0
    while attempts < MAX_RETRIEVE_ATTEMPTS:
        job_status_result = TRANSCRIBE_CLIENT.get_transcription_job(TranscriptionJobName=job_name)
        if 'TranscriptionJob' in job_status_result:
            if job_status_result['TranscriptionJob']['TranscriptionJobStatus'] == 'COMPLETED':

                print("Job Complete!")
                object_key = f'{job_name}.json'
                transcription_result = get_completed_transcript(BUCKET_NAME, object_key)
                transcription_result_dict = json.loads(transcription_result)
                items = transcription_result_dict['results']['items']
                full_transcript = transcription_result_dict['results']['transcripts'][0]['transcript']

                keyword_timestamp_map = []
                for item in items:
                    keyword_timestamp_map.append({'keyword': item['alternatives'][0]['content'],
                                                  'timestamp': item['start_time'] if 'start_time' in item.keys()
                                                  else ''})

                return jsonify({'fullTranscript': full_transcript,
                                'transcriptTimestampMap': keyword_timestamp_map})

            elif job_status_result['TranscriptionJob']['TranscriptionJobStatus'] == 'FAILED':
                print("Job Failed.")
                return jsonify({'error': "Transcription Job Failed."}), 500

            else:
                print("Job found, AWS Status: " + job_status_result['TranscriptionJob']['TranscriptionJobStatus'])
                attempts += 1
                time.sleep(2)
        else:
            print("Unable to find transcription job")
            return jsonify({'error': 'Transcription job not found'})

    return jsonify({'error': 'Exceeded limit of retrieve transcription attempts.'})


# root/endpoint: /transcribe
# @app.route decorator - called whenever a request hits the server with this path
# Request Content-Type: multipart/formData
@app.route('/transcribe', methods=['POST'])
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


# Run the Flask server
if __name__ == "__main__":
    app.run(debug=True)
