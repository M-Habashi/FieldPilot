import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { options as photoUploadOptions, upload as photoUpload } from './photoUploadHttp';

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: '/api/photo-upload', method: 'OPTIONS', handler: photoUploadOptions });
http.route({ path: '/api/photo-upload', method: 'POST', handler: photoUpload });

export default http;
