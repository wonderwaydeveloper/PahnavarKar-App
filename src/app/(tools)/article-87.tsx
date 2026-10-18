import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { NumericInputField } from '@/components/numeric-input-field';
import { ThemedText } from '@/components/themed-text';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { calculateArticle87WorkPermitFee } from '@/utils/salary-calculation';

const FIXED_RATE_PER_SQUARE_METER = 55000;

export default function Article87Screen() {
    const theme = useTheme();
    const { formatCurrency } = useCurrencyFormatter();
    const insets = useSafeAreaInsets();
    const [area, setArea] = useState('1');
    const [result, setResult] = useState<number | null>(null);

    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const latinDigits = '0123456789';

    const normalizeDigits = (value: string) => value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
    const toPersianDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);

    const changeArea = (delta: number) => {
        setArea((currentValue) => {
            const numericValue = Number(normalizeDigits((currentValue || '0').trim())) || 0;
            const nextValue = Math.max(0, numericValue + delta);
            return toPersianDigits(String(nextValue));
        });
    };

    const handleCalculate = () => {
        const numericValue = Number(normalizeDigits(area.trim()));

        if (!Number.isFinite(numericValue) || numericValue < 0) {
            setResult(null);
            return;
        }

        setResult(calculateArticle87WorkPermitFee(numericValue));
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
                                    مبلغ اعمال ماده ۸۷ قانون کار
                                </ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                        موضوع فرآیند صدور پروانه کسب یا پروانه بهره برداری
                                    </ThemedText>
                                </CalculationDescriptionBox>
                            </View>

                            <View
                                style={[
                                    styles.formulaBox,
                                    { display: 'none', backgroundColor: theme.surfaceVariant, borderColor: theme.border },
                                ]}
                            >
                                <ThemedText type="smallBold" style={[styles.formulaLabel, { color: theme.textSecondary }]}>
                                    فرمول محاسبه
                                </ThemedText>
                                <ThemedText type="small" style={[styles.formulaText, { color: theme.text }]}>
                                    {toPersianDigits(FIXED_RATE_PER_SQUARE_METER)} × میزان مترمربع زیربنای ساختمان کارگاه
                                </ThemedText>
                            </View>

                            <View style={styles.yearFieldsGroup}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                                    میزان مترمربع زیربنای ساختمان کارگاه
                                </ThemedText>
                                <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                    <Pressable
                                        onPress={() => changeArea(-1)}
                                        disabled={Number(normalizeDigits(area || '0')) <= 0}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                            Number(normalizeDigits(area || '0')) <= 0 && styles.stepperButtonDisabled,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="کاهش متراژ زیربنا"
                                    >
                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                    </Pressable>

                                    <NumericInputField
                                        mode="decimal"
                                        value={area}
                                        onChangeText={setArea}
                                        placeholder="۰"
                                        placeholderTextColor={theme.textSecondary}
                                        style={[styles.textInput, { color: theme.text, direction: 'ltr' }]}
                                        textAlign="center"
                                        accessibilityLabel="متراژ زیربنای ساختمان کارگاه"
                                    />

                                    <Pressable
                                        onPress={() => changeArea(1)}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="افزایش متراژ زیربنا"
                                    >
                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                    </Pressable>
                                </View>
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="calculator"
                                    buttonColor={theme.primary}
                                    textColor={theme.surface}
                                    style={styles.actionButton}
                                    labelStyle={styles.actionLabel}
                                >
                                    محاسبه
                                </Button>

                            </View>

                            {result !== null ? (
                                <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.resultContent}>
                                        <CalculationResultHeading />
                                        <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                مبلغ نهایی
                                            </ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primary }]}>
                                                {toPersianDigits(formatCurrency(result))}
                                            </ThemedText>
                                        </View>
                                    </Card.Content>
                                </Card>
                            ) : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>
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
    formulaBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    formulaLabel: { fontSize: 11 },
    formulaText: { fontSize: 12, lineHeight: 21 },
    yearFieldsGroup: { gap: Spacing.two },
    metricBox: { borderRadius: 14, padding: Spacing.two, gap: Spacing.one },
    sectionLabel: { fontSize: 11 },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    textInput: { flex: 1, minHeight: 42, fontFamily: 'AppFont-Bold', fontSize: 14, paddingVertical: 0 },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 10 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBox: {
        width: '100%',
        alignItems: 'center',
        gap: Spacing.one,
        padding: Spacing.two,
        borderRadius: 12,
        borderWidth: 1,
    },
    summaryLabel: { fontSize: 11 },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});
