import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { HiddenCalculationGuide } from '@/components/hidden-calculation-guide';
import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { NumericInputField } from '@/components/numeric-input-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
    calculateUnemploymentInsuranceEntitlement,
    type UnemploymentInsuranceEntitlementResult,
    type UnemploymentInsuranceMaritalStatus,
} from '@/utils/salary-calculation';

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';

function normalizeDigits(value: string) {
    return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}

function toPersianDigits(value: string | number) {
    return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

function changeMonths(value: string, delta: number) {
    const currentValue = Number(normalizeDigits(value || '0')) || 0;
    return toPersianDigits(String(Math.max(0, Math.trunc(currentValue) + delta)));
}

function formatMonths(value: number) {
    return `${toPersianDigits(value)} ماه`;
}

export default function UnemploymentInsuranceEntitlementScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [insuranceMonths, setInsuranceMonths] = useState('۶');
    const [usedMonths, setUsedMonths] = useState('۰');
    const [maritalStatus, setMaritalStatus] = useState<UnemploymentInsuranceMaritalStatus>('single');
    const [result, setResult] = useState<UnemploymentInsuranceEntitlementResult | null>(null);
    const [snackbarVisible, setSnackbarVisible] = useState(false);

    const handleCalculate = () => {
        const normalizedInsuranceMonths = Number(normalizeDigits(insuranceMonths || '0'));
        const normalizedUsedMonths = Number(normalizeDigits(usedMonths || '0'));

        if (
            !Number.isFinite(normalizedInsuranceMonths) ||
            !Number.isFinite(normalizedUsedMonths) ||
            normalizedInsuranceMonths < 0 ||
            normalizedUsedMonths < 0
        ) {
            setSnackbarVisible(true);
            setResult(null);
            return;
        }

        setResult(calculateUnemploymentInsuranceEntitlement(
            normalizedInsuranceMonths,
            normalizedUsedMonths,
            maritalStatus,
        ));
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    {
                        paddingTop: insets.top + Spacing.three,
                        paddingBottom: insets.bottom + Spacing.four,
                    },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerText}>
                                <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>
                                    مدت زمان پرداخت مقرری بیمه بیکاری
                                </ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                        محاسبه مدت زمان استحقاق دریافت مقرری بیمه بیکاری براساس ماده ۷ قانون بیمه بیکاری
                                    </ThemedText>
                                </CalculationDescriptionBox>
                            </View>

                            <HiddenCalculationGuide title="قاعده محاسبه استحقاق">
                                سابقه ۶ تا ۲۴ ماه: مجرد ۶ ماه، متأهل یا متکفل ۱۲ ماه{'\n'}
                                سابقه ۲۵ تا ۱۲۰ ماه: مجرد ۱۲ ماه، متأهل یا متکفل ۱۸ ماه{'\n'}
                                سابقه ۱۲۱ تا ۱۸۰ ماه: مجرد ۱۸ ماه، متأهل یا متکفل ۲۶ ماه{'\n'}
                                سابقه ۱۸۱ تا ۲۴۰ ماه: مجرد ۲۶ ماه، متأهل یا متکفل ۳۶ ماه{'\n'}
                                سابقه ۲۴۱ ماه به بالا: مجرد ۳۶ ماه، متأهل یا متکفل ۵۰ ماه{'\n'}
                                مدت باقی‌مانده = حداکثرِ (مدت استحقاق قانونی − ماه‌های استفاده‌شده، صفر).
                            </HiddenCalculationGuide>

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                                    میزان سابقه بیمه به ماه
                                </ThemedText>
                                <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                    <Pressable
                                        onPress={() => setInsuranceMonths((value) => changeMonths(value, -1))}
                                        disabled={Number(normalizeDigits(insuranceMonths || '0')) <= 0}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                            Number(normalizeDigits(insuranceMonths || '0')) <= 0 && styles.stepperButtonDisabled,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="کاهش سابقه بیمه"
                                    >
                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                    </Pressable>
                                    <NumericInputField
                                        value={insuranceMonths}
                                        onChangeText={setInsuranceMonths}
                                        placeholder="۰"
                                        placeholderTextColor={theme.textSecondary}
                                        style={[styles.textInput, { color: theme.text, direction: 'ltr' }]}
                                        textAlign="center"
                                        accessibilityLabel="میزان سابقه بیمه به ماه"
                                    />
                                    <Pressable
                                        onPress={() => setInsuranceMonths((value) => changeMonths(value, 1))}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="افزایش سابقه بیمه"
                                    >
                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                    </Pressable>
                                </View>
                            </View>

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                                    مدت استفاده از مقرری در گذشته به ماه
                                </ThemedText>
                                <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                    <Pressable
                                        onPress={() => setUsedMonths((value) => changeMonths(value, -1))}
                                        disabled={Number(normalizeDigits(usedMonths || '0')) <= 0}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                            Number(normalizeDigits(usedMonths || '0')) <= 0 && styles.stepperButtonDisabled,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="کاهش مدت استفاده از مقرری"
                                    >
                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                    </Pressable>
                                    <NumericInputField
                                        value={usedMonths}
                                        onChangeText={setUsedMonths}
                                        placeholder="۰"
                                        placeholderTextColor={theme.textSecondary}
                                        style={[styles.textInput, { color: theme.text, direction: 'ltr' }]}
                                        textAlign="center"
                                        accessibilityLabel="مدت استفاده از مقرری در گذشته به ماه"
                                    />
                                    <Pressable
                                        onPress={() => setUsedMonths((value) => changeMonths(value, 1))}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="افزایش مدت استفاده از مقرری"
                                    >
                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                    </Pressable>
                                </View>
                            </View>

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                                    وضعیت تأهل
                                </ThemedText>
                                <View style={styles.statusRow}>
                                    {([
                                        ['single', 'مجرد'],
                                        ['married', 'متأهل یا متکفل'],
                                    ] as const).map(([value, label]) => {
                                        const isSelected = maritalStatus === value;
                                        return (
                                            <Pressable
                                                key={value}
                                                onPress={() => setMaritalStatus(value)}
                                                style={[
                                                    styles.statusOption,
                                                    {
                                                        backgroundColor: isSelected ? theme.primaryContainer : theme.surface,
                                                        borderColor: isSelected ? theme.primary : theme.border,
                                                    },
                                                ]}
                                                accessibilityRole="radio"
                                                accessibilityState={{ selected: isSelected }}
                                                accessibilityLabel={label}
                                            >
                                                <MaterialCommunityIcons
                                                    name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                                                    size={19}
                                                    color={isSelected ? theme.primary : theme.textSecondary}
                                                />
                                                <ThemedText type="smallBold" style={{ color: isSelected ? theme.primary : theme.text }}>
                                                    {label}
                                                </ThemedText>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="briefcase-account"
                                    buttonColor={theme.primary}
                                    textColor={theme.surface}
                                    style={styles.actionButton}
                                    labelStyle={styles.actionLabel}
                                >
                                    محاسبه
                                </Button>
                            </View>

                            {result ? (
                                <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.resultContent}>
                                        <CalculationResultHeading topRadius={18} />
                                        <View style={styles.resultGrid}>
                                            <View style={[styles.resultBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.resultLabel, { color: theme.textSecondary }]}>
                                                    استحقاق طبق قانون
                                                </ThemedText>
                                                <ThemedText type="largeTitle" style={[styles.resultValue, { color: theme.text }]}>
                                                    {formatMonths(result.legalEntitlementMonths)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.resultBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                <ThemedText type="small" style={[styles.resultLabel, { color: theme.textSecondary }]}>
                                                    استحقاق نهایی
                                                </ThemedText>
                                                <ThemedText type="largeTitle" style={[styles.resultValue, { color: theme.primary }]}>
                                                    {formatMonths(result.remainingEntitlementMonths)}
                                                </ThemedText>
                                            </View>
                                        </View>
                                        <ThemedText type="small" style={[styles.calculationText, { color: theme.textSecondary }]}>
                                            {formatMonths(result.legalEntitlementMonths)} منهای {formatMonths(result.usedMonths)} مساوی {formatMonths(result.remainingEntitlementMonths)}
                                        </ThemedText>
                                    </Card.Content>
                                </Card>
                            ) : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.error, borderRadius: Radius.md }}
                action={{ label: 'بستن', onPress: () => setSnackbarVisible(false), labelStyle: { color: theme.surface } }}
            >
                <ThemedText type="small" style={{ color: theme.surface }}>
                    مقادیر واردشده معتبر نیستند.
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 0 },
    card: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    cardContent: { gap: Spacing.three, paddingVertical: Spacing.four, paddingHorizontal: Spacing.three },
    headerText: { gap: Spacing.one },
    pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    pageDescription: { fontSize: 13, lineHeight: 20 },
    rulesBox: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    rulesText: { lineHeight: 23 },
    metricBox: { borderRadius: 14, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, gap: Spacing.one },
    fieldLabel: { fontSize: 12 },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    textInput: { flex: 1, minHeight: 42, fontFamily: 'AppFont-Bold', fontSize: 14, paddingVertical: 0 },
    statusRow: { flexDirection: 'row', gap: Spacing.two },
    statusOption: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: Spacing.one, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: Spacing.two },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 12 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    resultGrid: { flexDirection: 'row', gap: Spacing.two },
    resultBox: { flex: 1, alignItems: 'center', gap: Spacing.one, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
    resultLabel: { fontSize: 10, lineHeight: 16, fontFamily: 'AppFont-Medium' },
    resultValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    calculationText: { textAlign: 'center', lineHeight: 22 },
});
