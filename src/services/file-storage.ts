import { Directory, File, Paths } from 'expo-file-system';
import { uuid } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';
import { saveToDownloadsAsync } from 'pahnavar-file-storage';

export interface SaveFileOptions {
    fileName: string;
    mimeType: string;
    folderName?: string;
}

export interface SavedFile {
    fileName: string;
    uri: string;
    location: 'downloads' | 'app-files';
}

function validateSinglePathSegment(value: string, label: string, isFolder = false): string {
    const segment = value.trim();
    if (
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[\\/\u0000-\u001f\u007f]/.test(segment) ||
        (isFolder && !/^[A-Za-z0-9 _.-]+$/.test(segment))
    ) {
        throw new Error(`${label} must be a non-empty path segment.`);
    }
    return segment;
}

function makeUniqueFileName(fileName: string): string {
    const safeName = validateSinglePathSegment(fileName, 'The file name');
    const extensionIndex = safeName.lastIndexOf('.');
    const hasExtension = extensionIndex > 0;
    const stem = hasExtension ? safeName.slice(0, extensionIndex) : safeName;
    const extension = hasExtension ? safeName.slice(extensionIndex) : '';
    const uniqueSuffix = uuid.v4();
    return `${stem}-${uniqueSuffix}${extension}`;
}

/**
 * Saves a file without opening a picker, using Downloads on Android and
 * the app's Files-visible Documents directory on iOS.
 */
export async function saveFileToDefaultLocation(
    sourceUri: string,
    options: SaveFileOptions,
): Promise<SavedFile> {
    if (!sourceUri.trim()) {
        throw new Error('The source file URI is required.');
    }
    const mimeType = options.mimeType.trim();
    if (!/^[A-Za-z0-9!#$&^_.+*-]+\/[A-Za-z0-9!#$&^_.+*-]+$/.test(mimeType)) {
        throw new Error('A valid MIME type is required.');
    }

    const fileName = makeUniqueFileName(options.fileName);
    const folderName = validateSinglePathSegment(
        options.folderName ?? 'PahnavarKar',
        'The destination folder name',
        true,
    );

    if (Platform.OS === 'android') {
        if (Number(Platform.Version) < 29) {
            const permission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            );
            if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
                throw new Error('مجوز ذخیره‌سازی در پوشهٔ Downloads داده نشد.');
            }
        }

        const uri = await saveToDownloadsAsync(
            sourceUri,
            fileName,
            mimeType,
            folderName,
        );
        return { fileName, uri, location: 'downloads' };
    }

    if (Platform.OS === 'ios') {
        const destinationDirectory = new Directory(Paths.document, folderName);
        destinationDirectory.create({ idempotent: true, intermediates: true });
        const destinationFile = new File(destinationDirectory, fileName);
        await new File(sourceUri).copy(destinationFile);
        return { fileName, uri: destinationFile.uri, location: 'app-files' };
    }

    throw new Error(`Saving files to the default location is not supported on ${Platform.OS}.`);
}
