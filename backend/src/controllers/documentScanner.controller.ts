import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  extractEntitiesFromText,
  findMatchesInDatabase,
  saveScannedDocumentBundle,
  ExtractedDocumentData
} from '../services/documentScanner.service';

export async function analyzeScannedDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const rawText = (req.body?.text as string) || '';
    const extracted: ExtractedDocumentData = extractEntitiesFromText(rawText);
    const match = await findMatchesInDatabase(extracted);

    return res.json({
      success: true,
      data: {
        extracted,
        match
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function uploadScannedDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma foto/página de documento foi enviada.'
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.'
      });
    }

    const {
      lotId,
      personId,
      documentTypeId,
      category,
      notes,
      updatePersonData,
      compileToPdf,
      extractedData: rawExtracted
    } = req.body;

    let parsedExtracted: ExtractedDocumentData | undefined = undefined;
    if (typeof rawExtracted === 'string') {
      try {
        parsedExtracted = JSON.parse(rawExtracted);
      } catch {
        // ignore parse error
      }
    } else if (typeof rawExtracted === 'object' && rawExtracted !== null) {
      parsedExtracted = rawExtracted;
    }

    const document = await saveScannedDocumentBundle({
      files,
      userId: req.user.id,
      lotId: lotId ? String(lotId) : undefined,
      personId: personId ? String(personId) : undefined,
      documentTypeId: documentTypeId ? String(documentTypeId) : undefined,
      category: category ? String(category) : undefined,
      notes: notes ? String(notes) : undefined,
      updatePersonData: updatePersonData === 'true' || updatePersonData === true,
      extractedData: parsedExtracted,
      compileToPdf: compileToPdf !== 'false' && compileToPdf !== false
    });

    return res.status(201).json({
      success: true,
      data: document,
      message: 'Documento escaneado e vinculado com sucesso!'
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Erro ao processar e vincular documento escaneado.'
    });
  }
}

