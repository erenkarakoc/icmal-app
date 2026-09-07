'use client';

import { satirTutari } from '@shared/lib/para';
import React, { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import { Label } from '@shared/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@shared/components/ui/dialog';
import { cn } from '@shared/lib/utils';
import { formatTurkishNumber } from '@shared/lib/turkish-number';
import { parseExcelFile, type ParsedExcel } from '@features/editor/lib/excel-parser';
import {
  guessColumnMapping,
  importExcelRows,
  type ExcelImportMapping,
  type ImportedRow,
  type ImportResult,
} from '../lib/excel-import';

interface UploadPozDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (rows: ImportedRow[]) => void;
}

type Step = 'upload' | 'column-mapping' | 'preview';

export function UploadPozDialog({ open, onOpenChange, onApply }: UploadPozDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [parsedExcel, setParsedExcel] = useState<ParsedExcel | null>(null);
  const [mapping, setMapping] = useState<ExcelImportMapping>({
    pozNoColumn: 0,
    descriptionColumn: 1,
    unitColumn: 2,
    quantityColumn: 3,
    unitPriceColumn: 4,
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setParsedExcel(null);
    setMapping({
      pozNoColumn: 0,
      descriptionColumn: 1,
      unitColumn: 2,
      quantityColumn: 3,
      unitPriceColumn: 4,
    });
    setImportResult(null);
    setError(null);
    setIsDragging(false);
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) resetState();
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState],
  );

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const parsed = await parseExcelFile(selectedFile);
      if (parsed.rows.length < 2) {
        setError('Excel dosyasında yeterli veri bulunamadı.');
        setIsLoading(false);
        return;
      }
      setParsedExcel(parsed);
      setMapping(guessColumnMapping(parsed.headers));
      setStep('column-mapping');
    } catch (err) {
      setError('Excel dosyası okunamadı. Lütfen geçerli bir Excel dosyası seçin.');
      console.error('Excel parse error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        const ext = droppedFile.name.split('.').pop()?.toLowerCase();
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
          handleFileSelect(droppedFile);
        } else {
          setError('Lütfen .xlsx, .xls veya .csv dosyası seçin.');
        }
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) handleFileSelect(selectedFile);
    },
    [handleFileSelect],
  );

  const handleColumnMappingNext = useCallback(() => {
    if (!parsedExcel) return;
    const result = importExcelRows(parsedExcel, mapping);
    setImportResult(result);
    setStep('preview');
  }, [parsedExcel, mapping]);

  const handleApply = useCallback(() => {
    if (!importResult || importResult.rows.length === 0) return;
    onApply(importResult.rows);
    handleOpenChange(false);
    toast.success(`${importResult.rows.length} satır eklendi`);
  }, [importResult, onApply, handleOpenChange]);

  const handleBack = useCallback(() => {
    if (step === 'column-mapping') {
      setStep('upload');
      setParsedExcel(null);
    } else if (step === 'preview') {
      setStep('column-mapping');
      setImportResult(null);
    }
  }, [step]);

  const updateMapping = useCallback((field: keyof ExcelImportMapping, value: number) => {
    setMapping((prev) => ({ ...prev, [field]: value }));
  }, []);

  const stopDragPropagation = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onDragEnter={stopDragPropagation}
        onDragOver={stopDragPropagation}
        onDragLeave={stopDragPropagation}
        onDrop={stopDragPropagation}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            Excel&apos;den Poz Yükle
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Excel dosyanızı yükleyin'}
            {step === 'column-mapping' && 'Excel sütunlarını eşleyin'}
            {step === 'preview' && 'İçe aktarılacak satırları onaylayın'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Step 1: File Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className={cn(
                  'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <Upload className="text-muted-foreground mx-auto mb-4 size-12" />
                <p className="text-muted-foreground mb-2 text-sm">
                  Excel dosyasını sürükleyin veya tıklayın
                </p>
                <p className="text-muted-foreground text-xs">.xlsx, .xls, .csv</p>
              </div>

              <p className="text-muted-foreground flex items-center justify-center gap-1 text-center text-xs">
                <Info className="size-3" />
                Poz No, Açıklama, Birim, Miktar ve Birim Fiyat sütunlarını içeren bir Excel dosyası
                seçin.
              </p>

              {isLoading && (
                <p className="text-muted-foreground text-center text-sm">Dosya okunuyor...</p>
              )}

              {error && (
                <div className="text-destructive flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'column-mapping' && parsedExcel && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['pozNoColumn', 'Poz No Sütunu'],
                    ['descriptionColumn', 'Açıklama Sütunu'],
                    ['unitColumn', 'Birim Sütunu'],
                    ['quantityColumn', 'Miktar Sütunu'],
                    ['unitPriceColumn', 'Birim Fiyat Sütunu'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="space-y-2">
                    <Label>{label}</Label>
                    <select
                      value={mapping[field]}
                      onChange={(e) => updateMapping(field, Number(e.target.value))}
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                    >
                      {parsedExcel.headers.map((header, idx) => (
                        <option key={idx} value={idx}>
                          {header || '(boş)'}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview first few rows */}
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Önizleme (ilk 5 satır)</p>
                <div className="max-h-48 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border-b px-3 py-2 text-left font-medium">Poz No</th>
                        <th className="border-b px-3 py-2 text-left font-medium">Açıklama</th>
                        <th className="border-b px-3 py-2 text-left font-medium">Birim</th>
                        <th className="border-b px-3 py-2 text-right font-medium">Miktar</th>
                        <th className="border-b px-3 py-2 text-right font-medium">B. Fiyat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedExcel.rows.slice(1, 6).map((row, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.cells[mapping.pozNoColumn] || '-'}
                          </td>
                          <td className="max-w-[150px] truncate px-3 py-2 text-xs">
                            {row.cells[mapping.descriptionColumn] || '-'}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {row.cells[mapping.unitColumn] || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {row.cells[mapping.quantityColumn] || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {row.cells[mapping.unitPriceColumn] || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && importResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Check className="size-4 text-green-500" />
                  <span>{importResult.rows.length} satır aktarılacak</span>
                </div>
                {importResult.skippedRows.length > 0 && (
                  <div className="text-muted-foreground">
                    {importResult.skippedRows.length} satır atlandı (boş poz no)
                  </div>
                )}
              </div>

              {importResult.rows.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  <AlertTriangle className="mx-auto mb-4 size-12 text-amber-500" />
                  <p>Aktarılacak satır bulunamadı.</p>
                  <p className="mt-2 text-sm">Lütfen sütun eşleştirmelerini kontrol edin.</p>
                </div>
              ) : (
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="border-b px-3 py-2 text-left font-medium">#</th>
                        <th className="border-b px-3 py-2 text-left font-medium">Poz No</th>
                        <th className="border-b px-3 py-2 text-left font-medium">Açıklama</th>
                        <th className="border-b px-3 py-2 text-left font-medium">Birim</th>
                        <th className="border-b px-3 py-2 text-right font-medium">Miktar</th>
                        <th className="border-b px-3 py-2 text-right font-medium">B. Fiyat</th>
                        <th className="border-b px-3 py-2 text-right font-medium">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.rows.map((row, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="text-muted-foreground px-3 py-2">{idx + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs">{row.pozNo}</td>
                          <td className="max-w-[180px] truncate px-3 py-2" title={row.description}>
                            {row.description}
                          </td>
                          <td className="px-3 py-2 text-xs">{row.unit}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatTurkishNumber(row.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatTurkishNumber(row.unitPrice)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium">
                            {formatTurkishNumber(satirTutari(row.quantity, row.unitPrice))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step !== 'upload' && (
            <Button variant="outline" onClick={handleBack}>
              <ChevronLeft className="mr-1 size-4" />
              Geri
            </Button>
          )}

          <div className="flex-1" />

          {step === 'column-mapping' && (
            <Button onClick={handleColumnMappingNext}>
              Önizle
              <ChevronRight className="ml-1 size-4" />
            </Button>
          )}

          {step === 'preview' && importResult && importResult.rows.length > 0 && (
            <Button onClick={handleApply}>
              <Check className="mr-1 size-4" />
              Uygula ({importResult.rows.length} satır)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
