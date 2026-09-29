import { createFakeDocumentRenderer } from '@/testing/fake-document-renderer';
import { documentRendererContract } from '../support/document-renderer-contract';

documentRendererContract('the in-memory fake', () => createFakeDocumentRenderer());
