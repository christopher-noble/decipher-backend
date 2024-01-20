from flask import Flask, request, jsonify, Response
from flask_cors import CORS, cross_origin
import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
import time
import json
from pytube import YouTube


BUCKET_NAME = "decipher-audio-files"
S3_CLIENT = boto3.client('s3')
TRANSCRIBE_CLIENT = boto3.client('transcribe', region_name='us-west-2')
FILE_MAX_DURATION_SECONDS = 300
YOUTUBE_URL_BASE = "https://www.youtube.com/watch?v="


# Application object w/ Flask constructor
app = Flask(__name__)
CORS(app, resources={r"/transcribe": {"origins": "http://localhost:3000"}})


# Upload a file object to s3
def upload_to_s3(file_stream, bucket_name, object_key):
    try:
        S3_CLIENT.upload_fileobj(file_stream, bucket_name, object_key)
        return f'Successfully uploaded to S3: s3://{bucket_name}/{object_key}'

    except (BotoCoreError, ClientError) as e:
        return str(e)


# Start a transcription job
def start_transcription_job(bucket_name, object_key, job_name, language_code='en-US'):
    try:
        response = TRANSCRIBE_CLIENT.start_transcription_job(
            TranscriptionJobName=job_name,
            LanguageCode=language_code,
            MediaFormat='mp3',  # replace with your audio format
            Media={'MediaFileUri': f's3://{bucket_name}/{object_key}'},
            OutputBucketName=bucket_name  # specify the bucket for the transcription output
        )
        return response

    except (BotoCoreError, ClientError) as e:
        return str(e)


# Retrieve the transcription job status
def get_transcription_job_status(job_name):
    try:
        response = TRANSCRIBE_CLIENT.get_transcription_job(TranscriptionJobName=job_name)
        return response

    except (BotoCoreError, ClientError) as e:
        return str(e)


# Download the json once the job is complete
def get_completed_transcript(bucket_name, object_key):
    try:
        response = S3_CLIENT.get_object(Bucket=bucket_name, Key=object_key)
        transcription_result = response['Body'].read().decode('utf-8')
        return transcription_result

    except NoCredentialsError:
        return 'AWS credentials not available'

    except Exception as e:
        return str(e)


# Get the result. Iterate until we hit an exception or return something (for now..)
def get_transcription_job_result(job_name):
    while True:
        try:
            job_status_result = get_transcription_job_status(job_name)

            if 'TranscriptionJob' in job_status_result and job_status_result['TranscriptionJob'][
                'TranscriptionJobStatus'] == 'COMPLETED':
                print("Job Complete!")

                object_key = f'{job_name}.json'
                transcription_result = get_completed_transcript(BUCKET_NAME, object_key)
                transcription_result_dict = json.loads(transcription_result)
                items = transcription_result_dict['results']['items']
                full_transcript = transcription_result_dict['results']['transcripts'][0]['transcript']

                keyword_timestamp_map = []
                for item in items:
                    keyword_timestamp_map.append({'keyword': item['alternatives'][0]['content'],
                                                  'timestamp': item[
                                                      'start_time'] if 'start_time' in item.keys() else ''})

                return jsonify({'fullTranscript': full_transcript,
                                'transcriptTimestampMap': keyword_timestamp_map})

            elif 'TranscriptionJob' in job_status_result:
                if job_status_result['TranscriptionJob']['TranscriptionJobStatus'] == 'FAILED':
                    print("Job Failed.")
                    return jsonify({'error': "e"}), 500

                print("Job found, AWS Status: " + job_status_result['TranscriptionJob']['TranscriptionJobStatus'])
                time.sleep(3)
            else:
                print("Unable to find transcription job")
                return jsonify({'error': 'Transcription job not found'})

        except Exception as e:
            return jsonify({'error': str(e)}), 500


# root/endpoint: /transcribe
# @app.route decorator - called whenever a request hits the server with this path
@app.route('/transcribe', methods=['POST'])
def transcribe():
    # Handling Content-Type: multipart/formData
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
                upload_result = upload_to_s3(file_object, BUCKET_NAME, file.filename)
                job = start_transcription_job(BUCKET_NAME, object_key, job_name)
                result = get_transcription_job_result(job_name)
                return result

            except Exception as e:
                return jsonify({'error': str(e)})

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
                        upload_result = upload_to_s3(f, BUCKET_NAME, object_key)
                    job = start_transcription_job(BUCKET_NAME, object_key, job_name)
                    result = get_transcription_job_result(job_name)
                    return result

                except Exception as e:
                    return jsonify({'error': f"Exception processing converted file. error: {str(e)}"})

            except KeyError:
                return jsonify({"error": "Unable to fetch video information."
                                         "Please check the video URL or your network connection."})

        else:
            return jsonify({"error": "No file found"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Run the Flask server
if __name__ == "__main__":
    app.run(debug=True)
