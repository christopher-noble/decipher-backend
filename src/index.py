# Flask
# python micro-web framework popular for web-dev and APIs - simplifies request handling
from flask import Flask, request, jsonify, Response
from flask_cors import CORS, cross_origin
# amazon transcribe sdk
import boto3

# application object w/ Flask constructor
app = Flask(__name__)
CORS(app, resources={r"/transcribe": {"origins": "http://localhost:3000"}})


# set up the root/endpoint: /transcribe
# @app.route decorator - this function is called whenever a request hits the server with this path
@app.route('/transcribe', methods=['POST'])
def transcribe():

    # Handling Content-Type: multipart/formData
    try:
        if 'file' in request.files or 'inputUrlRef' in request.form.keys():

            # Process Uploaded File
            if 'file' in request.files:
                file = request.files['file']
                if file.filename == '':
                    return jsonify({"error": "No selected file"}), 400

                # Log some details
                form_data = request.form['jobName']
                print(file)
                print("file name: " + file.filename)
                print("job name: " + form_data)
                print("file type: " + file.content_type)

                # TODO
                # File Transcription Logic Here
                # obj type: FileStorage - https://tedboy.github.io/flask/generated/generated/werkzeug.FileStorage.html
                # validate length
                # set mp3Buffer variable

            #  Process YouTube URL
            else:
                form_data = request.form['inputUrlRef']
                print(form_data)

                # TODO
                # File Transcription Logic Here
                # validate length
                # set mp3Buffer variable

            # TODO
            # Now that we have the mp3Buffer object from either upload method
            # create the parameters object (s3 docs)
            # create the command object (s3 docs)
            # send the command to s3 client - command has the mp3Buffer
            # start the transcription job
            # respond with the details
            return jsonify({"message": "File uploaded successfully"}), 200

        else:
            return jsonify({"error": "No file found"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Run the Flask server
if __name__ == "__main__":
    app.run(debug=True)


# Amazon s3 sample code - auth via CLI then these will work:
# s3 = boto3.resource('s3')
#
# # Print out bucket names
# for bucket in s3.buckets.all():
#     print(bucket.name)
#
#
# # Retrieve the list of existing buckets
# s3 = boto3.client('s3')
# response = s3.list_buckets()
#
# # Output the bucket names
# print('Existing buckets:')
# for bucket in response['Buckets']:
#     print(f'  {bucket["Name"]}')
